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
  buildCanonicalRecordFromCommand,
} from './generated/src/core/recordCommands/recordCommandEngine.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AUDIT_SOURCES,
} from './generated/src/core/audit/auditActions.js';
import { NOTIFICATION_STATUSES, createNotification } from './generated/src/core/workspace/notification.js';
import { generateId } from './generated/src/core/utils/generateId.js';

const OPERATION_STATUS = Object.freeze({
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

const OPERATION_LEASE_MS = 30_000;
const MAX_RECOVERY_ATTEMPTS = 10;

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
  return `rec_${createHash('sha256').update(operationId).digest('hex').slice(0, 20)}`;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

function computeCommandFingerprint(userId, command) {
  const { commandType, payload } = command;
  const { workspaceId, moduleId, values, isDraft } = payload;
  const normalized = stableJson({
    userId,
    commandType,
    workspaceId,
    moduleId,
    values,
    isDraft: isDraft ?? false,
  });
  return createHash('sha256').update(normalized).digest('hex');
}

function recordDoc(db, workspaceId, recordId) {
  return db.doc(`workspaces/${workspaceId}/records/${recordId}`);
}

function operationDoc(db, workspaceId, operationId) {
  return db.doc(`workspaces/${workspaceId}/recordOperations/${operationId}`);
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

function buildOperationDocument({ command, userId, fingerprint, status, recordId = null, attemptCount = 1, leaseMs = OPERATION_LEASE_MS }) {
  const now = Timestamp.now();
  return {
    operationId: command.operationId,
    workspaceId: command.payload.workspaceId,
    commandType: command.commandType,
    status,
    fingerprint,
    userId,
    recordId,
    attemptCount,
    leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + leaseMs),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function executeRecordCommand(db, { userId, command }) {
  if (!userId) fail(RECORD_COMMAND_ERROR_CODES.UNAUTHENTICATED, 'Authentication required.');

  const envelope = validateRecordCommand(command);
  if (!envelope.valid) {
    fail(envelope.code || RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID, envelope.errors.join('; '));
  }

  if (command.commandType !== RECORD_COMMAND_TYPES.CREATE_RECORD) {
    fail(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND, `Command ${command.commandType} is not implemented in this version.`);
  }

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

    return { status: OPERATION_STATUS.COMPLETED, record, idempotent: false };
  });

  if (result.status === OPERATION_STATUS.PROCESSING) {
    fail(RECORD_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  // Best-effort durable audit (outside transaction)
  try {
    const actor = { actorType: 'USER', actorId: userId };
    const auditEntry = createAuditEntry({
      auditEntryId: generateId(),
      workspaceId,
      actor,
      action: isDraft ? AUDIT_ACTIONS.RECORD_CREATED : AUDIT_ACTIONS.RECORD_SUBMITTED,
      resourceType: AUDIT_RESOURCE_TYPES.RECORD,
      resourceId: recordId,
      timestamp: now,
      metadata: { moduleId, moduleVersion: module.version, operationId: command.operationId, idempotent: result.idempotent },
      source: AUDIT_SOURCES.WEB,
      correlationId: `op:${command.operationId}`,
    });
    await db.collection(`workspaces/${workspaceId}/auditEntries`).add({
      ...auditEntry,
      _createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Audit is best-effort; the canonical Record is the authority.
  }

  // Best-effort notification mirroring the existing Event Bus notification bridge
  try {
    const actor = { actorType: 'USER', actorId: userId };
    const notification = createNotification({
      notificationId: generateId(),
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
    await db.collection(`workspaces/${workspaceId}/notifications`).add({
      ...notification,
      _createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // Notification is best-effort.
  }

  return { record: result.record, operationId: command.operationId, idempotent: result.idempotent };
}
