/**
 * Modulity 2.0 — File Query Service (Step 30)
 *
 * Read-side application service for canonical Files, File Versions and File
 * Attachments. All mutations go through the trusted fileCommand boundary —
 * this service performs no writes.
 *
 * @module core/files/fileService
 */

import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./fileRepository.js').FileRepository} deps.fileRepo
 * @param {import('./fileRepository.js').FileAttachmentRepository} deps.fileAttachmentRepo
 * @param {import('./fileRepository.js').FileVersionRepository} deps.fileVersionRepo
 */
export function createFileService({ fileRepo, fileAttachmentRepo, fileVersionRepo }) {
  async function getFile(workspaceId, fileId) {
    const file = await fileRepo.getById(workspaceId, fileId);
    if (!file || file.workspaceId !== workspaceId) {
      throw new AppError('not_found', `File not found: ${fileId}`);
    }
    return file;
  }

  async function listFiles(workspaceId) {
    return fileRepo.listByWorkspace(workspaceId);
  }

  async function getFileVersion(workspaceId, fileId, version) {
    const v = await fileVersionRepo.getVersion(workspaceId, fileId, version);
    if (!v || v.workspaceId !== workspaceId) {
      throw new AppError('not_found', `File version not found: ${fileId} v${version}`);
    }
    return v;
  }

  async function listFileVersions(workspaceId, fileId) {
    return fileVersionRepo.listVersions(workspaceId, fileId);
  }

  async function getAttachment(workspaceId, attachmentId) {
    const att = await fileAttachmentRepo.getById(workspaceId, attachmentId);
    if (!att || att.workspaceId !== workspaceId) {
      throw new AppError('not_found', `Attachment not found: ${attachmentId}`);
    }
    return att;
  }

  /**
   * Active attachments for a target, joined with the File metadata needed for
   * display. Orphan attachments (missing file) are skipped — the attachment
   * doc remains canonical history even if file resolution fails.
   */
  async function listAttachmentsForTarget(workspaceId, targetType, targetId) {
    const attachments = await fileAttachmentRepo.listActiveByTarget(workspaceId, targetType, targetId);
    const resolved = await Promise.all(attachments.map(async (att) => {
      const file = await fileRepo.getById(workspaceId, att.fileId);
      return file ? { attachment: att, file } : null;
    }));
    return resolved.filter(Boolean);
  }

  async function listAttachmentsForFile(workspaceId, fileId) {
    return fileAttachmentRepo.listByFile(workspaceId, fileId);
  }

  return Object.freeze({
    getFile,
    listFiles,
    getFileVersion,
    listFileVersions,
    getAttachment,
    listAttachmentsForTarget,
    listAttachmentsForFile,
  });
}
