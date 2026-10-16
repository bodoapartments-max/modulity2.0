/**
 * Trusted File Command Engine (Step 30)
 *
 * Server-authoritative executor for canonical File, File Version and File
 * Attachment operations. Mirrors the recordCommand boundary:
 *
 *   validate envelope → workspace authorization → operation journal
 *   → ONE Firestore transaction (domain write + journal COMPLETED +
 *     BusinessEvent + AuditEntry)
 *
 * Binary content never passes through this engine — clients upload bytes to
 * the canonical derived storage path via the storage adapter and register
 * metadata here.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  validateFileCommand,
  FILE_COMMAND_TYPES,
  FILE_COMMAND_ERROR_CODES,
} from './generated/src/core/files/fileCommandContract.js';
import {
  buildCanonicalFileFromCommand,
  buildNextFileVersionFromCommand,
  buildAttachmentFromCommand,
  buildFileMutationPatch,
} from './generated/src/core/files/fileCommandEngine.js';
import {
  evaluateFileAction,
  attachmentTargetDocPath,
} from './generated/src/core/files/fileActionPolicy.js';
import { createAuditEntry } from './generated/src/core/audit/auditEntry.js';
import {
  createBusinessEvent,
  businessEventIdFor,
  BUSINESS_EVENT_TYPES,
  BUSINESS_EVENT_SOURCES,
} from './generated/src/core/events/businessEvent.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  AUDIT_SOURCES,
} from './generated/src/core/audit/auditActions.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint,
  operationDoc,
  buildOperationDocument,
  peekCompletedOperation,
} from './operationJournal.js';

const fail = (code, message, details = {}) => {
  const httpCode =
    code === FILE_COMMAND_ERROR_CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === FILE_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND || code === FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND || code === FILE_COMMAND_ERROR_CODES.ATTACHMENT_NOT_FOUND || code === FILE_COMMAND_ERROR_CODES.TARGET_NOT_FOUND ? 'not-found'
    : code === FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN || code === FILE_COMMAND_ERROR_CODES.ACTION_NOT_ALLOWED || code === FILE_COMMAND_ERROR_CODES.UNSUPPORTED_TARGET ? 'permission-denied'
    : code === FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT || code === FILE_COMMAND_ERROR_CODES.OPERATION_MISMATCH ? 'already-exists'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

function fileDoc(db, workspaceId, fileId) {
  return db.doc(`workspaces/${workspaceId}/files/${fileId}`);
}
function fileVersionDoc(db, workspaceId, fileId, versionDocId) {
  return db.doc(`workspaces/${workspaceId}/files/${fileId}/versions/${versionDocId}`);
}
function attachmentDoc(db, workspaceId, attachmentId) {
  return db.doc(`workspaces/${workspaceId}/fileAttachments/${attachmentId}`);
}

async function loadWorkspace(db, workspaceId) {
  const snap = await db.doc(`workspaces/${workspaceId}`).get();
  return snap.exists ? snap.data() : null;
}

async function authorizeWorkspace(db, workspaceId, userId) {
  const workspace = await loadWorkspace(db, workspaceId);
  if (!workspace) fail(FILE_COMMAND_ERROR_CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.');

  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) {
      fail(FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may manage Files.');
    }
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') {
      fail(FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Active workspace membership is required.');
    }
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }
  fail(FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

function writeAuditInTransaction(transaction, db, workspaceId, { operationId, action, resourceType, resourceId, userId, metadata, timestamp }) {
  const entry = createAuditEntry({
    auditEntryId: `op_${operationId}_${action}`,
    workspaceId,
    actor: { actorType: 'USER', actorId: userId },
    action,
    resourceType,
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

function writeBusinessEventInTransaction(transaction, db, workspaceId, { operationId, eventType, userId, objectReference, payload, causeEventId = null }) {
  const eventId = businessEventIdFor(operationId, eventType);
  transaction.set(
    db.doc(`workspaces/${workspaceId}/businessEvents/${eventId}`),
    createBusinessEvent({
      eventId,
      eventType,
      workspaceId,
      source: BUSINESS_EVENT_SOURCES.FILE_COMMAND,
      actor: { actorType: 'USER', actorId: userId },
      objectReference,
      payload,
      idempotencyKey: operationId,
      correlationId: operationId,
      causeEventId,
    }),
  );
}

const FILE_ACTION_EVENTS = {
  [FILE_COMMAND_TYPES.CREATE_FILE]: BUSINESS_EVENT_TYPES.FILE_CREATED,
  [FILE_COMMAND_TYPES.CREATE_FILE_VERSION]: BUSINESS_EVENT_TYPES.FILE_VERSION_CREATED,
  [FILE_COMMAND_TYPES.ATTACH_FILE]: BUSINESS_EVENT_TYPES.FILE_ATTACHED,
  [FILE_COMMAND_TYPES.DETACH_FILE]: BUSINESS_EVENT_TYPES.FILE_DETACHED,
  [FILE_COMMAND_TYPES.ARCHIVE_FILE]: BUSINESS_EVENT_TYPES.FILE_ARCHIVED,
  [FILE_COMMAND_TYPES.RESTORE_FILE]: BUSINESS_EVENT_TYPES.FILE_RESTORED,
};

const FILE_AUDIT_ACTIONS = {
  [FILE_COMMAND_TYPES.CREATE_FILE]: AUDIT_ACTIONS.FILE_CREATED,
  [FILE_COMMAND_TYPES.CREATE_FILE_VERSION]: AUDIT_ACTIONS.FILE_VERSION_CREATED,
  [FILE_COMMAND_TYPES.ATTACH_FILE]: AUDIT_ACTIONS.FILE_ATTACHED,
  [FILE_COMMAND_TYPES.DETACH_FILE]: AUDIT_ACTIONS.FILE_DETACHED,
  [FILE_COMMAND_TYPES.ARCHIVE_FILE]: AUDIT_ACTIONS.FILE_ARCHIVED,
  [FILE_COMMAND_TYPES.RESTORE_FILE]: AUDIT_ACTIONS.FILE_RESTORED,
};


export async function executeFileCommand(db, { userId, command }) {
  if (!userId) fail(FILE_COMMAND_ERROR_CODES.UNAUTHENTICATED, 'Authentication required.');

  const envelope = validateFileCommand(command);
  if (!envelope.valid) {
    fail(envelope.code || FILE_COMMAND_ERROR_CODES.OPERATION_INVALID, envelope.errors.join('; '));
  }

  const { workspaceId } = command.payload;
  const fingerprint = computeOperationFingerprint(userId, command);
  const authz = await authorizeWorkspace(db, workspaceId, userId);
  const commandType = command.commandType;
  const opRef = operationDoc(db, workspaceId, command.operationId);

  // Journal replay FIRST: a COMPLETED op with matching identity + fingerprint
  // returns its recorded result without re-evaluating current domain state.
  const replay = await peekCompletedOperation(db, {
    workspaceId,
    operationId: command.operationId,
    userId,
    fingerprint,
    fail,
    codes: FILE_COMMAND_ERROR_CODES,
  });
  if (replay?.replay) {
    const snap = await db.doc(`workspaces/${workspaceId}/${replay.recordId}`).get();
    if (!snap.exists) {
      fail(FILE_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation is completed but has no resource reference.');
    }
    return { resource: snap.data(), operationId: command.operationId, idempotent: true };
  }

  // Resolve domain inputs (outside the journal transaction for reads is fine —
  // the policy/state checks re-verify inside the transaction).
  const domain = await resolveDomain(db, command);

  const result = await db.runTransaction(async (transaction) => {
    const opSnap = await transaction.get(opRef);
    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) {
        fail(FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      }
      if (op.fingerprint !== fingerprint) {
        fail(FILE_COMMAND_ERROR_CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      }
      if (op.status === OPERATION_STATUS.COMPLETED) {
        const snap = await transaction.get(db.doc(`workspaces/${workspaceId}/${op.recordId}`));
        if (!snap.exists) fail(FILE_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation completed but resource missing.');
        return { resource: snap.data(), idempotent: true, resourcePath: op.recordId };
      }
      if (op.status === OPERATION_STATUS.PROCESSING) {
        const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
        if (!leaseExpired) return { status: OPERATION_STATUS.PROCESSING };
        const attemptCount = (op.attemptCount || 1) + 1;
        if (attemptCount > MAX_RECOVERY_ATTEMPTS) {
          fail(FILE_COMMAND_ERROR_CODES.OPERATION_FAILED, 'Operation recovery limit exceeded.');
        }
        transaction.update(opRef, {
          status: OPERATION_STATUS.PROCESSING,
          attemptCount,
          leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        fail(FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      }
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    const now = new Date().toISOString();
    const actorContext = { authenticated: true, workspaceAccess: authz.authority };

    if (commandType === FILE_COMMAND_TYPES.CREATE_FILE) {
      const policy = evaluateFileAction({ actorContext, action: commandType });
      if (!policy.allowed) fail(policy.reasonCode, `Action ${commandType} is not allowed.`);
      const { file, version } = buildCanonicalFileFromCommand({ command, actorId: userId, now });
      const fRef = fileDoc(db, workspaceId, file.fileId);
      const fSnap = await transaction.get(fRef);
      if (fSnap.exists) {
        fail(FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'File already exists for this operation.');
      }
      transaction.set(fRef, { ...file, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
      transaction.set(fileVersionDoc(db, workspaceId, file.fileId, version.fileVersionId), version);
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: FILE_ACTION_EVENTS[commandType],
        userId,
        objectReference: { type: 'FILE', id: file.fileId, workspaceId },
        payload: { name: file.name, mimeType: file.mimeType, size: file.size, source: file.source },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: FILE_AUDIT_ACTIONS[commandType],
        resourceType: AUDIT_RESOURCE_TYPES.FILE,
        resourceId: file.fileId,
        userId,
        metadata: { name: file.name, mimeType: file.mimeType, size: file.size },
        timestamp: now,
      });
      const resourcePath = `files/${file.fileId}`;
      transaction.update(opRef, { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { resource: file, idempotent: false, resourcePath };
    }

    if (commandType === FILE_COMMAND_TYPES.CREATE_FILE_VERSION) {
      const fileSnap = await transaction.get(fileDoc(db, workspaceId, domain.file.fileId));
      const file = { ...domain.file, ...fileSnap.data() };
      const policy = evaluateFileAction({ actorContext, file, action: commandType });
      if (!policy.allowed) fail(policy.reasonCode, `Action ${commandType} is not allowed.`);
      const { version, filePatch } = buildNextFileVersionFromCommand({ command, file, actorId: userId, now });
      const vRef = fileVersionDoc(db, workspaceId, file.fileId, version.fileVersionId);
      const vSnap = await transaction.get(vRef);
      if (vSnap.exists) fail(FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'File version already exists.');
      transaction.set(vRef, version);
      transaction.update(fileDoc(db, workspaceId, file.fileId), { ...filePatch, _updatedAt: FieldValue.serverTimestamp() });
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: FILE_ACTION_EVENTS[commandType],
        userId,
        objectReference: { type: 'FILE', id: file.fileId, workspaceId },
        payload: { version: version.version, name: version.name, mimeType: version.mimeType, size: version.size },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: FILE_AUDIT_ACTIONS[commandType],
        resourceType: AUDIT_RESOURCE_TYPES.FILE,
        resourceId: file.fileId,
        userId,
        metadata: { version: version.version, name: version.name },
        timestamp: now,
      });
      const resourcePath = `files/${file.fileId}/versions/${version.fileVersionId}`;
      transaction.update(opRef, { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { resource: version, idempotent: false, resourcePath };
    }

    if (commandType === FILE_COMMAND_TYPES.ATTACH_FILE) {
      const fileSnap = await transaction.get(fileDoc(db, workspaceId, domain.file.fileId));
      const file = { ...domain.file, ...fileSnap.data() };
      const targetRef = db.doc(attachmentTargetDocPath(command.payload.targetType, workspaceId, command.payload.targetId));
      const targetSnap = await transaction.get(targetRef);
      const target = targetSnap.exists ? targetSnap.data() : null;
      const policy = evaluateFileAction({ actorContext, file, target, action: commandType });
      if (!policy.allowed) fail(policy.reasonCode, `Action ${commandType} is not allowed.`);
      if (target.workspaceId !== workspaceId) {
        fail(FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN, 'Attachment target is not in this workspace.');
      }
      const attachment = buildAttachmentFromCommand({ command, file, actorId: userId, now });
      const aRef = attachmentDoc(db, workspaceId, attachment.attachmentId);
      const aSnap = await transaction.get(aRef);
      if (aSnap.exists) fail(FILE_COMMAND_ERROR_CODES.OPERATION_CONFLICT, 'Attachment already exists for this operation.');
      transaction.set(aRef, { ...attachment, _createdAt: FieldValue.serverTimestamp() });
      // Maintain the derived target attachments index (canonical relation is
      // the attachment doc — the array is a query index, like entityReferenceIds).
      const current = Array.isArray(target.attachments) ? target.attachments : [];
      if (!current.includes(file.fileId)) {
        transaction.update(targetRef, { attachments: [...current, file.fileId] });
      }
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: FILE_ACTION_EVENTS[commandType],
        userId,
        objectReference: { type: 'FILE_ATTACHMENT', id: attachment.attachmentId, workspaceId },
        payload: { fileId: file.fileId, fileVersion: attachment.fileVersion, targetType: attachment.targetType, targetId: attachment.targetId },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: FILE_AUDIT_ACTIONS[commandType],
        resourceType: AUDIT_RESOURCE_TYPES.FILE_ATTACHMENT,
        resourceId: attachment.attachmentId,
        userId,
        metadata: { fileId: file.fileId, fileVersion: attachment.fileVersion, targetType: attachment.targetType, targetId: attachment.targetId },
        timestamp: now,
      });
      const resourcePath = `fileAttachments/${attachment.attachmentId}`;
      transaction.update(opRef, { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { resource: attachment, idempotent: false, resourcePath };
    }

    if (commandType === FILE_COMMAND_TYPES.DETACH_FILE) {
      const aRef = attachmentDoc(db, workspaceId, domain.attachment.attachmentId);
      const aSnap = await transaction.get(aRef);
      const attachment = aSnap.exists ? aSnap.data() : null;
      const policy = evaluateFileAction({ actorContext, attachment, action: commandType });
      if (!policy.allowed) fail(policy.reasonCode, `Action ${commandType} is not allowed.`);
      const patch = buildFileMutationPatch({ commandType, attachment, actorId: userId, now });
      transaction.update(aRef, patch);
      // Remove from the derived target index when the target still exists.
      const targetRef = db.doc(attachmentTargetDocPath(attachment.targetType, workspaceId, attachment.targetId));
      const targetSnap = await transaction.get(targetRef);
      if (targetSnap.exists) {
        const target = targetSnap.data();
        const current = Array.isArray(target.attachments) ? target.attachments : [];
        if (current.includes(attachment.fileId)) {
          transaction.update(targetRef, { attachments: current.filter((id) => id !== attachment.fileId) });
        }
      }
      writeBusinessEventInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        eventType: FILE_ACTION_EVENTS[commandType],
        userId,
        objectReference: { type: 'FILE_ATTACHMENT', id: attachment.attachmentId, workspaceId },
        payload: { fileId: attachment.fileId, targetType: attachment.targetType, targetId: attachment.targetId },
      });
      writeAuditInTransaction(transaction, db, workspaceId, {
        operationId: command.operationId,
        action: FILE_AUDIT_ACTIONS[commandType],
        resourceType: AUDIT_RESOURCE_TYPES.FILE_ATTACHMENT,
        resourceId: attachment.attachmentId,
        userId,
        metadata: { fileId: attachment.fileId, targetType: attachment.targetType, targetId: attachment.targetId },
        timestamp: now,
      });
      const resourcePath = `fileAttachments/${attachment.attachmentId}`;
      transaction.update(opRef, { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { resource: { ...attachment, ...patch }, idempotent: false, resourcePath };
    }

    // ARCHIVE_FILE / RESTORE_FILE
    const fileSnap = await transaction.get(fileDoc(db, workspaceId, domain.file.fileId));
    const file = { ...domain.file, ...fileSnap.data() };
    const policy = evaluateFileAction({ actorContext, file, action: commandType });
    if (!policy.allowed) fail(policy.reasonCode, `Action ${commandType} is not allowed.`);
    const patch = buildFileMutationPatch({ commandType, file, actorId: userId, now });
    transaction.update(fileDoc(db, workspaceId, file.fileId), { ...patch, _updatedAt: FieldValue.serverTimestamp() });
    writeBusinessEventInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      eventType: FILE_ACTION_EVENTS[commandType],
      userId,
      objectReference: { type: 'FILE', id: file.fileId, workspaceId },
      payload: { name: file.name },
    });
    writeAuditInTransaction(transaction, db, workspaceId, {
      operationId: command.operationId,
      action: FILE_AUDIT_ACTIONS[commandType],
      resourceType: AUDIT_RESOURCE_TYPES.FILE,
      resourceId: file.fileId,
      userId,
      metadata: { name: file.name },
      timestamp: now,
    });
    const resourcePath = `files/${file.fileId}`;
    transaction.update(opRef, { status: OPERATION_STATUS.COMPLETED, recordId: resourcePath, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { resource: { ...file, ...patch }, idempotent: false, resourcePath };
  });

  if (result.status === OPERATION_STATUS.PROCESSING) {
    fail(FILE_COMMAND_ERROR_CODES.OPERATION_IN_PROGRESS, 'The same operation is already being processed.');
  }

  return { resource: result.resource, operationId: command.operationId, idempotent: result.idempotent === true };
}

/**
 * Loads the domain objects a command needs before the journal transaction.
 * The transaction re-verifies state — these reads only short-circuit cheap
 * not-found errors.
 */
async function resolveDomain(db, command) {
  const { workspaceId } = command.payload;
  const type = command.commandType;

  if (type === FILE_COMMAND_TYPES.CREATE_FILE_VERSION || type === FILE_COMMAND_TYPES.ARCHIVE_FILE || type === FILE_COMMAND_TYPES.RESTORE_FILE) {
    const snap = await fileDoc(db, workspaceId, command.payload.fileId).get();
    if (!snap.exists) fail(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND, 'File not found.');
    return { file: snap.data() };
  }

  if (type === FILE_COMMAND_TYPES.ATTACH_FILE) {
    const snap = await fileDoc(db, workspaceId, command.payload.fileId).get();
    if (!snap.exists) fail(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND, 'File not found.');
    return { file: snap.data() };
  }

  if (type === FILE_COMMAND_TYPES.DETACH_FILE) {
    const snap = await attachmentDoc(db, workspaceId, command.payload.attachmentId).get();
    if (!snap.exists) fail(FILE_COMMAND_ERROR_CODES.ATTACHMENT_NOT_FOUND, 'Attachment not found.');
    return { attachment: snap.data() };
  }

  return {};
}
