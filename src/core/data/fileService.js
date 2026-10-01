/**
 * Modulity 2.0 — File Metadata Application Service
 *
 * Registers and resolves file metadata.
 * Binary upload/download is delegated to the storage adapter.
 *
 * @module core/data/fileService
 */

import { createFileMeta } from './file.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./fileRepository.js').FileRepository} deps.fileRepo
 */
export function createFileService({ fileRepo }) {
  async function registerFile({ workspaceId, name, mimeType, size, storagePath, storageProvider, checksum = null, uploadedBy }) {
    const file = createFileMeta({
      fileId: generateId(),
      workspaceId,
      name,
      mimeType,
      size,
      storagePath,
      storageProvider,
      checksum,
      uploadedBy,
    });

    const created = await fileRepo.create(file);

    eventBus.emit(createEvent({
      eventType: 'file.registered',
      workspaceId,
      actor: { type: uploadedBy.actorType === 'USER' ? 'user' : 'service', id: uploadedBy.actorId },
      payload: { fileId: created.fileId, name, mimeType },
    }));

    return created;
  }

  async function getFile(workspaceId, fileId) {
    const file = await fileRepo.getById(workspaceId, fileId);
    if (!file) throw new AppError('not_found', `File not found: ${fileId}`);
    return file;
  }

  async function listFiles(workspaceId) {
    return fileRepo.listByWorkspace(workspaceId);
  }

  return {
    registerFile,
    getFile,
    listFiles,
  };
}
