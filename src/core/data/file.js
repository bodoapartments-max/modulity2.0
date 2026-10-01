/**
 * Modulity 2.0 — File / Attachment Metadata
 *
 * Metadata for files (PDF, image, document, etc.).
 * Binary data is NOT stored in Firestore — only metadata.
 * Actual storage uses Firebase Storage or another provider.
 *
 * @module core/data/file
 */

/**
 * @typedef {Object} FileMeta
 * @property {string} fileId
 * @property {string} workspaceId
 * @property {string} name           — original file name
 * @property {string} mimeType
 * @property {number} size           — bytes
 * @property {string} storageProvider — e.g. 'firebase-storage'
 * @property {string} storagePath    — provider-specific path
 * @property {string|null} checksum
 * @property {Object} uploadedBy     — ActorRef
 * @property {string} createdAt
 */

/**
 * Creates a FileMeta value object.
 *
 * @param {Object} params
 * @returns {FileMeta}
 */
export function createFileMeta({
  fileId,
  workspaceId,
  name,
  mimeType,
  size,
  storageProvider = 'firebase-storage',
  storagePath,
  checksum = null,
  uploadedBy,
  createdAt,
}) {
  if (!fileId) throw new Error('fileId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!name) throw new Error('name is required');
  if (!mimeType) throw new Error('mimeType is required');
  if (typeof size !== 'number' || size < 0) {
    throw new Error('size must be a non-negative number');
  }
  if (!storagePath) throw new Error('storagePath is required');
  if (!uploadedBy) throw new Error('uploadedBy is required');

  return Object.freeze({
    fileId,
    workspaceId,
    name,
    mimeType,
    size,
    storageProvider,
    storagePath,
    checksum,
    uploadedBy: Object.freeze({ ...uploadedBy }),
    createdAt: createdAt || new Date().toISOString(),
  });
}
