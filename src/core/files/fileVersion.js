/**
 * Modulity 2.0 — Canonical File Version (Step 30)
 *
 * Immutable content identity for one version of a File. Historical references
 * (attachments, future Ledger evidence, future signature records) identify the
 * exact version that was used — head content may move, version docs never do.
 *
 * Firestore path: workspaces/{ws}/files/{fileId}/versions/{versionDocId}
 * with versionDocId === `v${version}` (deterministic, server-derived).
 *
 * @module core/files/fileVersion
 */

/**
 * @typedef {Object} FileVersion
 * @property {string} fileVersionId — `v${version}`
 * @property {string} fileId
 * @property {string} workspaceId
 * @property {number} version       — positive integer, monotonic per File
 * @property {string} name          — sanitized file name at this version
 * @property {string} mimeType
 * @property {number} size
 * @property {string|null} checksum — SHA-256 hex of this version's content
 * @property {string} storageProvider
 * @property {string} storagePath   — canonical path of THIS version's content
 * @property {Object} createdBy     — ActorRef
 * @property {string} createdAt
 */
export function createFileVersion({
  fileVersionId,
  fileId,
  workspaceId,
  version,
  name,
  mimeType,
  size,
  checksum = null,
  storageProvider = 'firebase-storage',
  storagePath,
  createdBy,
  createdAt,
}) {
  if (!fileVersionId) throw new Error('fileVersionId is required');
  if (!fileId) throw new Error('fileId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('version must be a positive integer');
  }
  if (!name) throw new Error('name is required');
  if (!mimeType) throw new Error('mimeType is required');
  if (typeof size !== 'number' || size < 0) {
    throw new Error('size must be a non-negative number');
  }
  if (!storagePath) throw new Error('storagePath is required');
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    fileVersionId,
    fileId,
    workspaceId,
    version,
    name,
    mimeType,
    size,
    checksum,
    storageProvider,
    storagePath,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
  });
}

/** Deterministic document id for a version: `v${version}`. */
export function fileVersionDocId(version) {
  return `v${version}`;
}
