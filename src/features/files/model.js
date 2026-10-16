/**
 * Modulity 2.0 — File Feature Model (Step 30)
 *
 * Client-side upload orchestration. Business authority stays server-side:
 * the browser computes the canonical storage path (shared derivation), uploads
 * bytes through the Storage Adapter, computes the content checksum, then
 * registers metadata through the trusted fileCommand boundary.
 *
 * @module features/files/model
 */

import { generateId } from '../../core/utils/generateId.js';
import {
  deriveFileId,
  buildFileStoragePath,
  sanitizeFileName,
  validateMimeType,
  validateFileSize,
} from '../../core/files/fileConstraints.js';

/**
 * SHA-256 hex digest of a browser File/Blob via WebCrypto.
 * Used for content-integrity identity — never a signature.
 */
export async function sha256HexOfBlob(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Uploads a browser file to the canonical storage path and registers the
 * canonical File through the trusted command boundary.
 *
 * Upload-first flow: the browser derives fileId + storagePath from its own
 * operationId, uploads bytes, then issues CREATE_FILE. The server derives
 * the same path authoritatively — it never accepts a client-supplied path.
 * A command failure after a successful upload leaves an orphan blob; the
 * deferred storage-sweeper concern is documented in docs/UNIVERSAL_FILES.md.
 *
 * @param {Object} params
 * @param {import('../../core/files/fileStorageContract.js').FileStorageAdapter} params.storage
 * @param {Object} params.fileCommand — trusted command facade
 * @param {string} params.workspaceId
 * @param {File|Blob} params.browserFile — must expose .name/.size/.type
 * @param {string} [params.displayName]
 * @param {Object} [params.metadata]
 * @returns {Promise<{fileId: string, operationId: string}>}
 */
export async function uploadCanonicalFile({ storage, fileCommand, workspaceId, browserFile, displayName, metadata }) {
  const name = sanitizeFileName(browserFile?.name || '');
  if (!name) throw new Error('The selected file has no usable file name.');
  const mimeType = browserFile.type || 'application/octet-stream';
  const mime = validateMimeType(mimeType);
  if (!mime.valid) throw new Error(mime.error);
  const size = validateFileSize(browserFile.size);
  if (!size.valid) throw new Error(size.error);

  const operationId = generateId();
  const fileId = deriveFileId(operationId);
  const storagePath = buildFileStoragePath({ workspaceId, fileId, version: 1, name });

  await storage.upload(storagePath, browserFile, { contentType: mimeType });
  const checksum = await sha256HexOfBlob(browserFile);

  await fileCommand.createFile({
    operationId,
    workspaceId,
    name,
    displayName,
    mimeType,
    size: browserFile.size,
    checksum,
    metadata,
  });

  return { fileId, operationId };
}

/**
 * Uploads a file and attaches it to a canonical target in one flow.
 * Both operations run through the trusted boundary; a failed attach leaves
 * the uploaded File registered but unattached (recoverable, not silent).
 *
 * @returns {Promise<{fileId: string, attachmentId: string}>}
 */
export async function uploadAndAttachFile({ storage, fileCommand, workspaceId, browserFile, targetType, targetId, displayName, metadata }) {
  const { fileId } = await uploadCanonicalFile({ storage, fileCommand, workspaceId, browserFile, displayName, metadata });
  const attachResult = await fileCommand.attachFile({ workspaceId, fileId, targetType, targetId });
  return { fileId, attachmentId: attachResult?.resource?.attachmentId || null };
}

/** Display helper — bounded human-readable byte size. */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
