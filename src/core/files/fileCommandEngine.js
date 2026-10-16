/**
 * Modulity 2.0 — Trusted File Command Engine (pure/validation layer)
 *
 * Transport-independent canonical construction for file commands. Used by the
 * Cloud Function executor; safe for client-side non-authoritative validation.
 *
 * @module core/files/fileCommandEngine
 */

import { FILE_COMMAND_TYPES, FILE_COMMAND_ERROR_CODES } from './fileCommandContract.js';
import { createFile, FILE_SOURCES } from './file.js';
import { createFileVersion, fileVersionDocId } from './fileVersion.js';
import { createFileAttachment, ATTACHMENT_STATUSES } from './fileAttachment.js';
import {
  sanitizeFileName,
  extractFileExtension,
  buildFileStoragePath,
  deriveFileId,
  deriveAttachmentId,
} from './fileConstraints.js';
import { userActor } from '../data/actorRef.js';

export { FILE_COMMAND_TYPES, FILE_COMMAND_ERROR_CODES };

/**
 * Builds the canonical File document + its first FileVersion from a
 * CREATE_FILE command. Server-authoritative identity/path/timestamps are
 * derived here and in the caller, never from the payload.
 *
 * @returns {{ file: Object, version: Object }}
 */
export function buildCanonicalFileFromCommand({ command, actorId, now = new Date().toISOString() }) {
  const payload = command.payload;
  const fileId = deriveFileId(command.operationId);
  const safeName = sanitizeFileName(payload.name);
  if (!safeName) throw new Error('name must contain at least one usable character');
  const displayName = payload.displayName ? sanitizeFileName(payload.displayName) : null;
  const storagePath = buildFileStoragePath({ workspaceId: payload.workspaceId, fileId, version: 1, name: safeName });
  const actor = userActor(actorId);

  const file = createFile({
    fileId,
    workspaceId: payload.workspaceId,
    name: safeName,
    displayName,
    extension: extractFileExtension(safeName),
    mimeType: payload.mimeType,
    size: payload.size,
    checksum: payload.checksum ?? null,
    status: 'ACTIVE',
    source: payload.source || FILE_SOURCES.USER_UPLOAD,
    currentVersion: 1,
    storagePath,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    metadata: payload.metadata || {},
  });

  const version = createFileVersion({
    fileVersionId: fileVersionDocId(1),
    fileId,
    workspaceId: payload.workspaceId,
    version: 1,
    name: safeName,
    mimeType: payload.mimeType,
    size: payload.size,
    checksum: payload.checksum ?? null,
    storagePath,
    createdBy: actor,
    createdAt: now,
  });

  return { file, version };
}

/**
 * Builds the next FileVersion + the File head patch for CREATE_FILE_VERSION.
 *
 * @param {Object} params
 * @param {Object} params.command
 * @param {Object} params.file — current canonical File
 * @returns {{ version: Object, filePatch: Object }}
 */
export function buildNextFileVersionFromCommand({ command, file, actorId, now = new Date().toISOString() }) {
  const payload = command.payload;
  const nextVersion = file.currentVersion + 1;
  const rawName = payload.name ?? file.name;
  const safeName = sanitizeFileName(rawName);
  if (!safeName) throw new Error('name must contain at least one usable character');
  const displayName = payload.displayName ? sanitizeFileName(payload.displayName) : file.displayName;
  const storagePath = buildFileStoragePath({
    workspaceId: payload.workspaceId, fileId: file.fileId, version: nextVersion, name: safeName,
  });
  const actor = userActor(actorId);

  const version = createFileVersion({
    fileVersionId: fileVersionDocId(nextVersion),
    fileId: file.fileId,
    workspaceId: payload.workspaceId,
    version: nextVersion,
    name: safeName,
    mimeType: payload.mimeType,
    size: payload.size,
    checksum: payload.checksum ?? null,
    storagePath,
    createdBy: actor,
    createdAt: now,
  });

  const filePatch = {
    name: safeName,
    displayName,
    extension: extractFileExtension(safeName),
    mimeType: payload.mimeType,
    size: payload.size,
    checksum: payload.checksum ?? null,
    currentVersion: nextVersion,
    storagePath,
    updatedAt: now,
    ...(payload.metadata ? { metadata: payload.metadata } : {}),
  };

  return { version, filePatch };
}

/**
 * Builds the canonical FileAttachment for ATTACH_FILE. fileVersion is pinned
 * to the File's currentVersion at attach time.
 *
 * @returns {import('./fileAttachment.js').FileAttachment}
 */
export function buildAttachmentFromCommand({ command, file, actorId, now = new Date().toISOString() }) {
  const payload = command.payload;
  return createFileAttachment({
    attachmentId: deriveAttachmentId(command.operationId),
    workspaceId: payload.workspaceId,
    fileId: file.fileId,
    fileVersion: file.currentVersion,
    targetType: payload.targetType,
    targetId: payload.targetId,
    attachedBy: userActor(actorId),
    attachedAt: now,
  });
}

/**
 * Builds the canonical mutation patch for lifecycle commands.
 * Identity/actor/timestamps are derived by the trusted executor.
 */
export function buildFileMutationPatch({ commandType, file: _file, attachment: _attachment, actorId, now = new Date().toISOString() }) {
  const actor = userActor(actorId);
  switch (commandType) {
    case FILE_COMMAND_TYPES.ARCHIVE_FILE:
      return { status: 'ARCHIVED', archivedAt: now, archivedBy: { actorType: actor.actorType, actorId: actor.actorId }, updatedAt: now };
    case FILE_COMMAND_TYPES.RESTORE_FILE:
      return { status: 'ACTIVE', archivedAt: null, archivedBy: null, updatedAt: now };
    case FILE_COMMAND_TYPES.DETACH_FILE:
      return {
        status: ATTACHMENT_STATUSES.DETACHED,
        detachedAt: now,
        detachedBy: { actorType: actor.actorType, actorId: actor.actorId },
      };
    default:
      throw new Error(`No mutation patch for command ${commandType}`);
  }
}
