/**
 * Modulity 2.0 — Canonical File (Step 30)
 *
 * A File is a canonical platform resource — never owned conceptually by a
 * Module. Business objects relate to Files through FileAttachments
 * (fileAttachment.js), not through File ownership.
 *
 * FILE = canonical stored resource (metadata + version pointer)
 * FILE VERSION = immutable content identity (fileVersion.js)
 * ATTACHMENT = relationship between a File and a platform object
 *
 * Binary content is NEVER stored in Firestore documents and NEVER in base64.
 * The File document stores metadata and a provider-agnostic storage reference
 * only; binary bytes live behind the File Storage Adapter boundary.
 *
 * @module core/files/file
 */

export const FILE_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  /** Terminal soft-delete tombstone. Physical purge is a separate trusted
   *  compliance operation — never implied by a UI action. */
  DELETED: 'DELETED',
});

export const FILE_SOURCES = Object.freeze({
  USER_UPLOAD: 'USER_UPLOAD',
  GENERATED: 'GENERATED',
  IMPORTED: 'IMPORTED',
  EXTERNAL_CONNECTOR: 'EXTERNAL_CONNECTOR',
  AGENT_PRODUCED: 'AGENT_PRODUCED',
});

/**
 * Sources a normal interactive trusted command may claim. GENERATED/IMPORTED/
 * EXTERNAL_CONNECTOR/AGENT_PRODUCED are produced by other trusted producers
 * and must not be requestable through the interactive fileCommand surface.
 */
export const CLIENT_CLAIMABLE_FILE_SOURCES = Object.freeze([
  FILE_SOURCES.USER_UPLOAD,
]);

export const FILE_SCHEMA_VERSION = '2.0.0';

/**
 * @typedef {Object} File
 * @property {string} fileId
 * @property {string} workspaceId
 * @property {string} name            — sanitized original file name
 * @property {string} displayName     — human display title (defaults to name)
 * @property {string|null} extension  — lower-case extension without dot
 * @property {string} mimeType
 * @property {number} size            — bytes of the current version
 * @property {string|null} checksum   — SHA-256 hex of current version content
 * @property {string} status          — FILE_STATUSES
 * @property {string} source          — FILE_SOURCES provenance
 * @property {number} currentVersion  — version number of head content (>=1)
 * @property {string} storageProvider — e.g. 'firebase-storage'
 * @property {string} storagePath     — canonical path of the CURRENT version
 * @property {Object} createdBy       — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} archivedAt
 * @property {Object|null} archivedBy — ActorRef
 * @property {Object} metadata        — bounded caller metadata (no secrets)
 * @property {string} schemaVersion
 */
export function createFile({
  fileId,
  workspaceId,
  name,
  displayName = null,
  extension = null,
  mimeType,
  size,
  checksum = null,
  status = FILE_STATUSES.ACTIVE,
  source = FILE_SOURCES.USER_UPLOAD,
  currentVersion = 1,
  storageProvider = 'firebase-storage',
  storagePath,
  createdBy,
  createdAt,
  updatedAt,
  archivedAt = null,
  archivedBy = null,
  metadata = {},
  schemaVersion = FILE_SCHEMA_VERSION,
}) {
  if (!fileId) throw new Error('fileId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!name) throw new Error('name is required');
  if (!mimeType) throw new Error('mimeType is required');
  if (typeof size !== 'number' || size < 0) {
    throw new Error('size must be a non-negative number');
  }
  if (!FILE_STATUSES[status]) throw new Error(`Invalid file status: ${status}`);
  if (!FILE_SOURCES[source]) throw new Error(`Invalid file source: ${source}`);
  if (typeof currentVersion !== 'number' || !Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error('currentVersion must be a positive integer');
  }
  if (!storagePath) throw new Error('storagePath is required');
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    fileId,
    workspaceId,
    name,
    displayName: displayName || name,
    extension,
    mimeType,
    size,
    checksum,
    status,
    source,
    currentVersion,
    storageProvider,
    storagePath,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    archivedAt,
    archivedBy: archivedBy ? Object.freeze({ ...archivedBy }) : null,
    metadata: Object.freeze({ ...metadata }),
    schemaVersion,
  });
}
