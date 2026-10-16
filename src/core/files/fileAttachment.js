/**
 * Modulity 2.0 — Canonical File Attachment (Step 30)
 *
 * An Attachment is the explicit relationship between a canonical File and
 * another platform object. It is the source of truth for "file F is attached
 * to target T"; `record.attachments` / `entity.attachments` remain derived
 * indexes maintained by the trusted file command boundary.
 *
 * Attachment docs pin `fileVersion` at attach time so historical references
 * identify the version that was actually used.
 *
 * Firestore path: workspaces/{ws}/fileAttachments/{attachmentId}
 *
 * @module core/files/fileAttachment
 */

export const ATTACHMENT_TARGET_TYPES = Object.freeze({
  RECORD: 'RECORD',
  ENTITY: 'ENTITY',
});

/**
 * Reserved future targets — documented extension points only. They are NOT in
 * ATTACHMENT_TARGET_TYPES and are rejected by validation until their command
 * semantics are implemented (CONVERSATION needs chat membership semantics).
 */
export const RESERVED_ATTACHMENT_TARGET_TYPES = Object.freeze([
  'CONVERSATION',
]);

export const ATTACHMENT_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  DETACHED: 'DETACHED',
});

/**
 * @typedef {Object} FileAttachment
 * @property {string} attachmentId
 * @property {string} workspaceId
 * @property {string} fileId
 * @property {number} fileVersion   — File version pinned at attach time
 * @property {string} targetType    — ATTACHMENT_TARGET_TYPES
 * @property {string} targetId
 * @property {string} status        — ATTACHMENT_STATUSES
 * @property {Object} attachedBy    — ActorRef
 * @property {string} attachedAt
 * @property {Object|null} detachedBy — ActorRef
 * @property {string|null} detachedAt
 */
export function createFileAttachment({
  attachmentId,
  workspaceId,
  fileId,
  fileVersion,
  targetType,
  targetId,
  status = ATTACHMENT_STATUSES.ACTIVE,
  attachedBy,
  attachedAt,
  detachedBy = null,
  detachedAt = null,
}) {
  if (!attachmentId) throw new Error('attachmentId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!fileId) throw new Error('fileId is required');
  if (typeof fileVersion !== 'number' || !Number.isInteger(fileVersion) || fileVersion < 1) {
    throw new Error('fileVersion must be a positive integer');
  }
  if (!ATTACHMENT_TARGET_TYPES[targetType]) {
    throw new Error(`Invalid attachment target type: ${targetType}`);
  }
  if (!targetId) throw new Error('targetId is required');
  if (!ATTACHMENT_STATUSES[status]) throw new Error(`Invalid attachment status: ${status}`);
  if (!attachedBy) throw new Error('attachedBy is required');

  return Object.freeze({
    attachmentId,
    workspaceId,
    fileId,
    fileVersion,
    targetType,
    targetId,
    status,
    attachedBy: Object.freeze({ ...attachedBy }),
    attachedAt: attachedAt || new Date().toISOString(),
    detachedBy: detachedBy ? Object.freeze({ ...detachedBy }) : null,
    detachedAt,
  });
}
