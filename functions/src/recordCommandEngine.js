import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  validateRecordCommand,
  RECORD_COMMAND_TYPES,
  RECORD_COMMAND_ERROR_CODES,
} from './generated/src/core/recordCommands/recordCommandContract.js';
import {
  validateCreateRecordCommand,
  validateUpdateDraftCommand,
  validateSubmitRecordCommand,
  buildCanonicalRecordFromCommand,
  buildRecordMutationPatch,
} from './generated/src/core/recordCommands/recordCommandEngine.js';
import { evaluateRecordAction } from './generated/src/core/recordCommands/recordActionPolicy.js';
import { evaluateRecordTransition } from './generated/src/core/recordCommands/recordLifecycle.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AUDIT_SOURCES,
} from './generated/src/core/audit/auditActions.js';
import { NOTIFICATION_STATUSES, createNotification } from './generated/src/core/workspace/notification.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint as computeCommandFingerprint,
  operationDoc,
  buildOperationDocument,
} from './operationJournal.js';

const fail = (code, message, details = {}) => {
  const httpCode =
    code === RECORD_COMMAND_ERROR_CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === RECORD_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND || code === RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND ? 'not-found'
    : code === RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN || code === RECORD_COMMAND_ERROR_CODES.MODULE_FORBIDDEN ? 'permission-denied'
    : code === RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT || code === RECORD_COMMAND_ERROR_CODES.OPERATION_MISMATCH ? 'already-exists'
    : code === RECORD_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS ? 'failed-precondition'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

function deriveRecordId(operationId) {
  return `rec_${createHash256(operationId).slice(0, 20)}`;
}

function createHash256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function recordDoc(db, workspaceId, recordId) {
  return db.doc(`workspaces/${workspaceId}/records/${recordId}`);
}

async function loadWorkspace(db, workspaceId) {
  const snap = await db.doc(`workspaces/${workspaceId}`).get();
  return snap.exists ? snap.data() : null;
}

async function authorizeWorkspace(db, workspaceId, userId) {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) fail(RECORD_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.');

  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) {
      fail(RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may submit Records.');
    }
    return { workspace, authority: 'PERSONAL_OWNER' };
  }

  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') {
      fail(RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Active workspace membership is required.');
    }
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }

  fail(RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

async function loadModule(db, workspaceId, moduleId) {
  const snap = await db.doc(`workspaces/${workspaceId}/modules/${moduleId}`).get();
  return snap.exists ? snap.data() : null;
}

async function loadVersionSnapshot(db, workspaceId, moduleId, version) {
  const snap = await db.doc(`workspaces/${workspaceId}/modules/${moduleId}/versions/${version}`).get();
  return snap.exists ? snap.data() : null;
}

async function resolveEntityReferences(db, workspaceId, refs, fields) {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  for (const ref of refs) {
    const entitySnap = await db.doc(`workspaces/${workspaceId}/entities/${ref.entityId}`).get();
    if (!entitySnap.exists) {
      fail(RECORD_COMMAND_ERROR_CODES.ENTITY_REFERENCE_INVALID, `Referenced entity not found: ${ref.entityId}`);
    }
    const entity = entitySnap.data();
    if (entity.workspaceId !== workspaceId) {
      fail(RECORD_COMMAND_ERROR_CODES.ENTITY_REFERENCE_INVALID, 'Cross-workspace entity reference denied');
    }
    if (entity.entityTypeId !== ref.entityTypeId) {
      fail(RECORD_COMMAND_ERROR_CODES.ENTITY_REFERENCE_INVALID, `Entity type mismatch for ${ref.entityId}`);
    }
    const field = fieldByKey.get(ref._fieldKey);
    if (field && field.entityTypeId && entity.entityTypeId !== field.entityTypeId) {
      fail(RECORD_COMMAND_ERROR_CODES.ENTITY_REFERENCE_INVALID, `Reference does not match declared entity type for field ${field.key}`);
    }
  }
}

function buildFirestoreRecordDocument(record) {
  const { createdAt, updatedAt, ...rest } = record;
  return {
    ...rest,
    _createdAt: FieldValue.serverTimestamp(),
    _updatedAt: FieldValue.serverTimestamp(),
  };
}

function mapFromFirestoreRecord(snap) {
  if (!snap.exists) return null;
  const d = snap.data();
  return {
    ...d,
    recordId: snap.id,
    createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
    updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
  };
}

function writeAuditInTransaction(transaction, db, workspaceId, { operationId, action, resourceId, userId, metadata, timestamp }) {
  const entry = createAuditEntry({
    auditEntryId: `op_${operationId}_${action}`,
    workspaceId,
    actor: { actorType: 'USER', actorId: userId },
    action,
    resourceType: AUDIT_RESOURCE_TYPES.RECORD,
    resourceId,
    timestamp,
    metadata: { ...(metadata || {}), operationId },
    source: AUDIT_SOURCES.WEB,
    correlationId: `op:${operationId}`,
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/auditEntries/op_${operationId}_${action}`), {
    ...entry,
    _timestamp: FieldValue.serverTimestamp(),
  });
}

export async function executeRecordCommand(db, { userId, command }) {
  if (!userId) fail(RECORD_COMMAND_ERROR_CODES.UNAUTHENTICATED, 'Authentication required.');

  const envelope = validateRecordCommand(command);
  if (!envelope.valid) {
    fail(envelope.code || RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID, envelope.errors.join('; '));
  }

  if (command.commandType === RECORD_COMMAND_TYPES.CREATE_RECORD) {
    return executeCreateRecordCommand(db, { userId, command });
  }
  if (RECORD_MUTATION_COMMANDS.has(command.commandType)) {
    return executeRecordMutationCommand(db, { userId, command });
  }

  fail(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND, `Command ${command.commandType} is not implemented in this version.`);
}

const RECORD_MUTATION_COMMANDS = new Set([
  RECORD_COMMAND_TYPES.UPDATE_DRAFT,
  RECORD_COMMAND_TYPES.SUBMIT_RECORD,
  RECORD_COMMAND_TYPES.SET_PRIORITY,
  RECORD_COMMAND_TYPES.ARCHIVE_RECORD,
  RECORD_COMMAND_TYPES.RESTORE_RECORD,
  RECORD_COMMAND_TYPES.CANCEL_RECORD,
]);

const MUTATION_AUDIT_ACTIONS = {
  [RECORD_COMMAND_TYPES.UPDATE_DRAFT]: AUDIT_ACTIONS.RECORD_DRAFT_UPDATED,
  [RECORD_COMMAND_TYPES.SUBMIT_RECORD]: AUDIT_ACTIONS.RECORD_SUBMITTED,
  [RECORD_COMMAND_TYPES.SET_PRIORITY]: AUDIT_ACTIONS.RECORD_PRIORITY_CHANGED,
  [RECORD_COMMAND_TYPES.ARCHIVE_RECORD]: AUDIT_ACTIONS.RECORD_ARCHIVED,
  [RECORD_COMMAND_TYPES.RESTORE_RECORD]: AUDIT_ACTIONS.RECORD_UNARCHIVED,
  [RECORD_COMMAND_TYPES.CANCEL_RECORD]: AUDIT_ACTIONS.RECORD_CANCELLED,
};

async function executeCreateRecordCommand(db, { userId, command }) {
  const { workspaceId, moduleId, values, isDraft = false } = command.payload;
  const fingerprint = computeCommandFingerprint(userId, command);

  // Authorization and workspace isolation
  await authorizeWorkspace(db, workspaceId, userId);

  // Module authority: server resolves the canonical module and version snapshot
  const moduleData = await loadModule(db, workspaceId, moduleId);
  if (!moduleData) fail(RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND, 'Module not found.');
  if (moduleData.workspaceId !== workspaceId) fail(RECORD_COMMAND_ERROR_CODES.MODULE_FORBIDDEN, 'Module does not belong to this workspace.');

  const status = moduleData.status;
  if (status !== 'ACTIVE') {
    fail(RECORD_COMMAND_ERROR_CODES.MODULE_NOT_ACTIVE, `Module status "${status}" does not allow record creation. Only ACTIVE Modules may receive canonical Records.`);
  }

  const versionSnap = await loadVersionSnapshot(db, workspaceId, moduleId, moduleData.version);
  const module = {
    ...moduleData,
    formSchema: versionSnap?.formSchema || moduleData.formSchema,
    recordConfig: versionSnap?.recordConfig || moduleData.recordConfig,
  };

  const validation = validateCreateRecordCommand(command, module);
  if (!validation.valid) {
    fail(validation.code || RECORD_COMMAND_ERROR_CODES.RECORD_INVALID, validation.errors.join('; '));
  }

  const fields = module.formSchema?.fields || [];
  const entityRefsWithFieldKey = (validation.entityRefs || []).map((ref) => {
    const field = fields.find((f) => f.type === 'entity-reference' && values[f.key]?.entityId === ref.entityId);
    return { ...ref, _fieldKey: field?.key };
  });

  await resolveEntityReferences(db, workspaceId, entityRefsWithFieldKey, fields);

  const recordId = deriveRecordId(command.operationId);
  const opRef = operationDoc(db, workspaceId, command.operationId);
  const recRef = recordDoc(db, workspaceId, recordId);

  const now = new Date().toISOString();

  const result = await db.runTransaction(async (transaction) => {
    const opSnap = await transaction.get(opRef);
    const recSnap = await transaction.get(recRef);

    if (opSnap.exists) {
      const op = opSnap.data();

      // Ownership and integrity checks
      if (op.userId !== userId || op.workspaceId !== workspaceId) {
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      }
      if (op.fingerprint !== fingerprint) {
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      }

      if (op.status === OPERATION_STATUS.COMPLETED) {
        if (op.recordId) {
          const existingSnap = await transaction.get(recordDoc(db, workspaceId, op.recordId));
          return { status: OPERATION_STATUS.COMPLETED, record: mapFromFirestoreRecord(existingSnap), idempotent: true };
        }
        // Corrupt completed op without recordId: fail safely
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation is completed but has no Record reference.');
      }

      if (op.status === OPERATION_STATUS.PROCESSING) {
        const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
        if (!leaseExpired) {
          return { status: OPERATION_STATUS.PROCESSING, record: null, idempotent: false };
        }

        // Stale PROCESSING: recover by inspecting canonical state
        if (recSnap.exists) {
          // Record was actually created but operation marker was not updated
          transaction.update(opRef, {
            status: OPERATION_STATUS.COMPLETED,
            recordId,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { status: OPERATION_STATUS.COMPLETED, record: mapFromFirestoreRecord(recSnap), idempotent: true };
        }

        // Lease expired and Record does not exist: recover by reacquiring
        const attemptCount = (op.attemptCount || 1) + 1;
        if (attemptCount > MAX_RECOVERY_ATTEMPTS) {
          fail(RECORD_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
        }
        transaction.update(opRef, {
          status: OPERATION_STATUS.PROCESSING,
          attemptCount,
          leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (op.status === OPERATION_STATUS.FAILED) {
        // FAILED is terminal; do not auto-recover
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      }
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    const record = buildCanonicalRecordFromCommand({
      command,
      module,
      actorId: userId,
      recordId,
      now,
    });

    transaction.set(recRef, buildFirestoreRecordDocument(record));

    transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      recordId,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Authoritative Audit evidence in the SAME transaction as the Record —
    // a trusted mutation cannot silently lose its history (Step 16).
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: isDraft ? AUDIT_ACTIONS.RECORD_CREATED : AUDIT_ACTIONS.RECORD_SUBMITTED,
      resourceId: recordId,
      userId,
      metadata: { moduleId, moduleVersion: module.version },
      timestamp: now,
    });

    return { status: OPERATION_STATUS.COMPLETED, record, idempotent: false };
  });

  if (result.status === OPERATION_STATUS.PROCESSING) {
    fail(RECORD_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  // Best-effort notification mirroring the existing Event Bus notification bridge
  try {
    const actor = { actorType: 'USER', actorId: userId };
    const notification = createNotification({
      notificationId: `op_${command.operationId}`,
      workspaceId,
      recipientUserId: userId,
      type: isDraft ? 'RECORD_DRAFT_SAVED' : 'RECORD_CREATED',
      title: isDraft ? 'Draft saved' : 'Record created',
      message: `Record ${recordId.slice(0, 8)}… was ${isDraft ? 'saved as draft' : 'created'}`,
      resourceType: 'RECORD',
      resourceId: recordId,
      actionUrl: `/app/records/${recordId}`,
      createdBy: actor,
      status: NOTIFICATION_STATUSES.UNREAD,
    });
    await db.doc(`workspaces/${workspaceId}/notifications/op_${command.operationId}`).set({
      ...notification,
      _createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Notification is best-effort.
  }

  return { record: result.record, operationId: command.operationId, idempotent: result.idempotent };
}

/**
 * Trusted mutation path for UPDATE_DRAFT, SUBMIT_RECORD, SET_PRIORITY,
 * ARCHIVE_RECORD, RESTORE_RECORD and CANCEL_RECORD.
 *
 * The operation journal entry and the Record mutation are committed in ONE
 * Firestore transaction, so a crash cannot produce "journal COMPLETED but
 * mutation missing" or a duplicated transition. Retry with the same
 * operationId replays the recorded journal result. A fresh operationId
 * re-evaluates the lifecycle against CURRENT Record state, so a redundant
 * SUBMIT on an already-submitted Record is rejected.
 */
async function executeRecordMutationCommand(db, { userId, command }) {
  const commandType = command.commandType;
  const { workspaceId, recordId } = command.payload;
  const fingerprint = computeCommandFingerprint(userId, command);

  // Authorization and workspace isolation
  const authz = await authorizeWorkspace(db, workspaceId, userId);

  // Journal replay: a COMPLETED operation with matching identity and
  // fingerprint returns the recorded operation result. This runs BEFORE the
  // lifecycle policy so that a retried SUBMIT on an already-submitted Record
  // replays the legitimate earlier operation instead of failing.
  const opRef = operationDoc(db, workspaceId, command.operationId);
  const opSnapPre = await opRef.get();
  if (opSnapPre.exists) {
    const op = opSnapPre.data();
    if (op.userId !== userId || op.workspaceId !== workspaceId) {
      fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
    }
    if (op.fingerprint !== fingerprint) {
      fail(RECORD_COMMAND_ERROR_CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
    }
    if (op.status === OPERATION_STATUS.COMPLETED) {
      const replaySnap = await recordDoc(db, workspaceId, op.recordId || recordId).get();
      if (replaySnap.exists) {
        return { record: mapFromFirestoreRecord(replaySnap), operationId: command.operationId, idempotent: true };
      }
      fail(RECORD_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation is completed but has no Record reference.');
    }
    if (op.status === OPERATION_STATUS.FAILED) {
      fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
    }
  }

  const recSnap = await recordDoc(db, workspaceId, recordId).get();
  if (!recSnap.exists) fail(RECORD_COMMAND_ERROR_CODES.RECORD_NOT_FOUND, 'Record not found.');
  const record = mapFromFirestoreRecord(recSnap);

  // Module + historical version schema for Module-bound Records
  let module = null;
  if (record.moduleId) {
    const moduleData = await loadModule(db, workspaceId, record.moduleId);
    if (moduleData) {
      const versionSnap = record.moduleVersion
        ? await loadVersionSnapshot(db, workspaceId, record.moduleId, record.moduleVersion)
        : null;
      module = {
        ...moduleData,
        formSchema: versionSnap?.formSchema || moduleData.formSchema,
        recordConfig: versionSnap?.recordConfig || moduleData.recordConfig,
      };
    }
  }

  const policy = evaluateRecordAction({
    actorContext: { authenticated: true, workspaceAccess: authz.authority },
    record,
    module,
    action: commandType,
  });
  if (!policy.allowed) {
    fail(policy.reasonCode || RECORD_COMMAND_ERROR_CODES.ACTION_NOT_ALLOWED, `Action ${commandType} is not allowed for this Record.`);
  }

  const fields = module?.formSchema?.fields || [];

  if (commandType === RECORD_COMMAND_TYPES.UPDATE_DRAFT) {
    const validation = validateUpdateDraftCommand(command, module);
    if (!validation.valid) {
      fail(validation.code || RECORD_COMMAND_ERROR_CODES.RECORD_INVALID, validation.errors.join('; '));
    }
    const values = command.payload.values || {};
    const entityRefsWithFieldKey = (validation.entityRefs || []).map((ref) => {
      const field = fields.find((f) => f.type === 'entity-reference' && values[f.key]?.entityId === ref.entityId);
      return { ...ref, _fieldKey: field?.key };
    });
    await resolveEntityReferences(db, workspaceId, entityRefsWithFieldKey, fields);
  }

  const now = new Date().toISOString();
  const recRef = recordDoc(db, workspaceId, recordId);

  const result = await db.runTransaction(async (transaction) => {
    const opSnap = await transaction.get(opRef);
    const recSnapTx = await transaction.get(recRef);
    if (!recSnapTx.exists) fail(RECORD_COMMAND_ERROR_CODES.RECORD_NOT_FOUND, 'Record not found.');
    const current = mapFromFirestoreRecord(recSnapTx);

    if (opSnap.exists) {
      const op = opSnap.data();

      if (op.userId !== userId || op.workspaceId !== workspaceId) {
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      }
      if (op.fingerprint !== fingerprint) {
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      }

      if (op.status === OPERATION_STATUS.COMPLETED) {
        return { status: OPERATION_STATUS.COMPLETED, record: current, idempotent: true };
      }

      if (op.status === OPERATION_STATUS.PROCESSING) {
        const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
        if (!leaseExpired) {
          return { status: OPERATION_STATUS.PROCESSING, record: null, idempotent: false };
        }
        const attemptCount = (op.attemptCount || 1) + 1;
        if (attemptCount > MAX_RECOVERY_ATTEMPTS) {
          fail(RECORD_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
        }
        transaction.update(opRef, {
          status: OPERATION_STATUS.PROCESSING,
          attemptCount,
          leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (op.status === OPERATION_STATUS.FAILED) {
        fail(RECORD_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      }
    } else {
      transaction.set(opRef, buildOperationDocument({
        command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING, recordId,
      }));
    }

    // Lifecycle transition re-evaluated inside the transaction against the
    // CURRENT canonical state — not the pre-transaction snapshot.
    const transition = evaluateRecordTransition(current, commandType);
    if (!transition.allowed) {
      fail(transition.reasonCode || RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE, `Transition ${commandType} is not valid for a ${current.status} Record.`);
    }

    // SUBMIT validates the CURRENT stored data inside the transaction as well.
    if (commandType === RECORD_COMMAND_TYPES.SUBMIT_RECORD) {
      const validation = validateSubmitRecordCommand(command, current, module);
      if (!validation.valid) {
        fail(validation.code || RECORD_COMMAND_ERROR_CODES.RECORD_INVALID, validation.errors.join('; '));
      }
    }

    const patch = buildRecordMutationPatch({
      commandType, command, record: current, fields, actorId: userId, now,
    });

    transaction.update(recRef, { ...patch, _updatedAt: FieldValue.serverTimestamp() });
    transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      recordId,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Authoritative Audit evidence in the SAME transaction as the mutation
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: MUTATION_AUDIT_ACTIONS[commandType],
      resourceId: recordId,
      userId,
      metadata: {
        moduleId: current.moduleId ?? null,
        moduleVersion: current.moduleVersion ?? null,
        fromStatus: current.status,
        toStatus: patch.status ?? current.status,
      },
      timestamp: now,
    });

    return { status: OPERATION_STATUS.COMPLETED, record: { ...current, ...patch }, idempotent: false };
  });

  if (result.status === OPERATION_STATUS.PROCESSING) {
    fail(RECORD_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  return { record: result.record, operationId: command.operationId, idempotent: result.idempotent };
}
