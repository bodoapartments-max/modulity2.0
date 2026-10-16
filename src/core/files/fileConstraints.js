/**
 * Modulity 2.0 — File Constraints & Canonical Path Derivation (Step 30)
 *
 * Deterministic, transport-independent rules shared by the browser upload
 * pipeline and the trusted file command engine:
 *
 *   - filename sanitization/safety (path traversal, control chars, length)
 *   - MIME type shape validation
 *   - size limits
 *   - checksum shape (SHA-256 hex)
 *   - deterministic File/Attachment identity derivation from operationId
 *   - canonical storage path derivation (server-authoritative)
 *
 * The browser computes the canonical path to know WHERE to upload; the
 * trusted command engine re-derives it and never accepts a client-supplied
 * storage path.
 *
 * @module core/files/fileConstraints
 */

export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB
export const MAX_MIME_TYPE_LENGTH = 128;
export const MAX_FILE_METADATA_BYTES = 16 * 1024; // 16 KiB caller metadata

const MIME_TYPE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

// Characters that must never survive into a stored file name: path
// separators, control characters, and Windows-reserved characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\\/<>:"|?*\x00-\x1f\x7f]/g;

/**
 * Sanitizes a client-supplied file name for canonical storage.
 * - removes path separators, control characters and reserved characters
 * - strips leading dots/whitespace that could hide the name or form `..`
 * - collapses whitespace
 * - enforces the canonical length bound
 *
 * Returns null when nothing usable remains.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function sanitizeFileName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name
    .replace(UNSAFE_NAME_CHARS, '_')
    .replace(/\.+/g, (dots, offset) => (offset === 0 ? '' : dots))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}

/**
 * True when the name is already canonical-safe (sanitizeFileName is a no-op).
 * Used for validation messages — sanitize, don't silently rewrite, on the
 * trusted boundary the engine uses sanitizeFileName and rejects empties.
 */
export function isSafeFileName(name) {
  const sanitized = sanitizeFileName(name);
  return sanitized !== null && sanitized === name;
}

/** Lower-case extension without the dot; null when the name has none. */
export function extractFileExtension(name) {
  if (typeof name !== 'string') return null;
  const base = name.split('/').pop();
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return null;
  const ext = base.slice(idx + 1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(ext) ? ext : null;
}

/**
 * @returns {{valid: boolean, error?: string}}
 */
export function validateMimeType(mimeType) {
  if (typeof mimeType !== 'string' || !mimeType) {
    return { valid: false, error: 'mimeType is required' };
  }
  if (mimeType.length > MAX_MIME_TYPE_LENGTH) {
    return { valid: false, error: `mimeType exceeds ${MAX_MIME_TYPE_LENGTH} chars` };
  }
  if (!MIME_TYPE_PATTERN.test(mimeType)) {
    return { valid: false, error: 'mimeType must have the form type/subtype' };
  }
  return { valid: true };
}

/**
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFileSize(size) {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return { valid: false, error: 'size must be a non-negative number' };
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `size exceeds the ${MAX_FILE_SIZE_BYTES}-byte limit` };
  }
  return { valid: true };
}

/**
 * Checksum is optional but, when present, must be a lowercase SHA-256 hex
 * digest. It is a content-integrity identifier — never a signature.
 */
export function validateChecksum(checksum) {
  if (checksum === null || checksum === undefined) return { valid: true };
  if (typeof checksum !== 'string' || !SHA256_HEX_PATTERN.test(checksum)) {
    return { valid: false, error: 'checksum must be a 64-char lowercase SHA-256 hex digest' };
  }
  return { valid: true };
}

/**
 * Deterministic File identity: one trusted operation produces exactly one
 * File. Mirrors the recordCommand `rec_{hash}` convention but keeps the raw
 * operation id because it is already a path-safe UUID.
 */
export function deriveFileId(operationId) {
  return `f_${operationId}`;
}

/** Deterministic Attachment identity for idempotent attach operations. */
export function deriveAttachmentId(operationId) {
  return `att_${operationId}`;
}

/**
 * Canonical storage path for one version of one File.
 *
 *   workspaces/{workspaceId}/files/{fileId}/v{version}/{sanitizedName}
 *
 * The trusted engine derives this itself; a command payload must NEVER
 * supply storagePath.
 */
export function buildFileStoragePath({ workspaceId, fileId, version, name }) {
  const safeName = sanitizeFileName(name);
  if (!workspaceId || !fileId || !version || !safeName) {
    throw new Error('Cannot derive storage path: workspaceId, fileId, version and a safe name are required');
  }
  return `workspaces/${workspaceId}/files/${fileId}/v${version}/${safeName}`;
}
