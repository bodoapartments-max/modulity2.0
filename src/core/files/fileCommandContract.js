/**
 * Modulity 2.0 — Trusted File Command Contract (Step 30)
 *
 * Versioned, server-authoritative command envelope for canonical File,
 * File Version and File Attachment operations.
 *
 * Implemented commands:
 *   CREATE_FILE         — register a new canonical File at version 1
 *   CREATE_FILE_VERSION — append immutable version N+1 to an existing File
 *   ATTACH_FILE         — relate a File to a closed attachment target
 *   DETACH_FILE         — remove an Attachment relationship (history kept)
 *   ARCHIVE_FILE        — File lifecycle ACTIVE → ARCHIVED
 *   RESTORE_FILE        — File lifecycle ARCHIVED → ACTIVE
 *
 * The server derives actor, fileId, attachmentId, storagePath, version number,
 * status and timestamps. Browsers never send them.
 *
 * Binary content never travels through this contract — the client uploads
 * bytes through the File Storage Adapter to the canonical derived path, then
 * registers metadata here. The command stores the declared checksum; deep
 * server-side content-hash verification against the blob is a documented
 * deferred production concern.
 *
 * @module core/files/fileCommandContract
 */

import {
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_METADATA_BYTES,
  sanitizeFileName,
  validateMimeType,
  validateFileSize,
  validateChecksum,
} from './fileConstraints.js';
import { ATTACHMENT_TARGET_TYPES } from './fileAttachment.js';
import { FILE_SOURCES, CLIENT_CLAIMABLE_FILE_SOURCES } from './file.js';

export const FILE_COMMAND_CONTRACT_VERSION = '1.0.0';
export const SUPPORTED_FILE_CONTRACT_VERSIONS = Object.freeze(['1.0.0']);

export const FILE_COMMAND_TYPES = Object.freeze({
  CREATE_FILE: 'CREATE_FILE',
  CREATE_FILE_VERSION: 'CREATE_FILE_VERSION',
  ATTACH_FILE: 'ATTACH_FILE',
  DETACH_FILE: 'DETACH_FILE',
  ARCHIVE_FILE: 'ARCHIVE_FILE',
  RESTORE_FILE: 'RESTORE_FILE',
});

export const FILE_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  ATTACHMENT_NOT_FOUND: 'ATTACHMENT_NOT_FOUND',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  UNSUPPORTED_TARGET: 'UNSUPPORTED_TARGET',
  INVALID_FILE_STATE: 'INVALID_FILE_STATE',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  FILE_INVALID: 'FILE_INVALID',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  OPERATION_INVALID: 'OPERATION_INVALID',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

const MAX_OPERATION_ID_LENGTH = 128;
const MAX_METADATA_KEYS = 32;

/**
 * Server-authoritative fields. Presence in a payload means the client tried
 * to override identity/lifecycle authority.
 */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor', 'actorId', 'userId',
  'createdBy', 'updatedBy', 'uploadedBy', 'attachedBy', 'detachedBy',
  'createdAt', 'updatedAt', 'attachedAt', 'detachedAt', 'archivedAt',
  'status', 'statusTarget',
  'storagePath', 'storageProvider', 'currentVersion', 'version',
]);

/**
 * Derived resource identities that a given command must NOT receive — the
 * server derives them from operationId/current state. (`fileId`/`attachmentId`
 * ARE legitimate payload fields on commands that address an existing File or
 * Attachment, mirroring `recordId` in the Record command contract.)
 */
const COMMAND_FORBIDDEN_KEYS = Object.freeze({
  [FILE_COMMAND_TYPES.CREATE_FILE]: Object.freeze(['fileId', 'fileVersionId', 'attachmentId']),
  [FILE_COMMAND_TYPES.CREATE_FILE_VERSION]: Object.freeze(['fileVersionId', 'attachmentId']),
  [FILE_COMMAND_TYPES.ATTACH_FILE]: Object.freeze(['attachmentId', 'fileVersion']),
  [FILE_COMMAND_TYPES.DETACH_FILE]: Object.freeze(['fileId', 'targetType', 'targetId', 'fileVersionId']),
  [FILE_COMMAND_TYPES.ARCHIVE_FILE]: Object.freeze(['fileVersionId', 'attachmentId']),
  [FILE_COMMAND_TYPES.RESTORE_FILE]: Object.freeze(['fileVersionId', 'attachmentId']),
});

function payloadByteSize(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function validateMetadata(metadata, errors) {
  if (metadata === undefined) return;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    errors.push('payload.metadata must be a plain object');
    return;
  }
  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    errors.push(`payload.metadata may contain at most ${MAX_METADATA_KEYS} keys`);
  }
  if (payloadByteSize(metadata) > MAX_FILE_METADATA_BYTES) {
    errors.push('payload.metadata exceeds size limit');
  }
  for (const key of Object.keys(metadata)) {
    const lower = key.toLowerCase();
    if (lower.includes('secret') || lower.includes('token') || lower.includes('password') || lower.includes('key')) {
      errors.push(`payload.metadata key '${key}' looks like secret material and is not allowed in File metadata`);
    }
  }
}

function validateNameLike(name, label, errors, { required = true } = {}) {
  if (name === undefined || name === null) {
    if (required) errors.push(`payload.${label} is required`);
    return;
  }
  if (typeof name !== 'string' || !sanitizeFileName(name)) {
    errors.push(`payload.${label} must be a usable file name`);
    return;
  }
  if (name.length > MAX_FILE_NAME_LENGTH * 2) {
    errors.push(`payload.${label} exceeds maximum length`);
  }
}

/**
 * Validates a FileCommand envelope and payload structure.
 * Does NOT check workspace/file/target authority — the server engine owns
 * that.
 *
 * @param {Object} command
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateFileCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'], code: FILE_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }
  if (!SUPPORTED_FILE_CONTRACT_VERSIONS.includes(command.contractVersion)) {
    return {
      valid: false,
      errors: [`Unsupported contract version: ${command.contractVersion}`],
      code: FILE_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION,
    };
  }
  if (!command.commandType || !FILE_COMMAND_TYPES[command.commandType]) {
    return {
      valid: false,
      errors: [`Unsupported command type: ${command.commandType}`],
      code: FILE_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND,
    };
  }
  if (!command.operationId || typeof command.operationId !== 'string' || command.operationId.length > MAX_OPERATION_ID_LENGTH) {
    errors.push(`operationId is required and must be a string with max ${MAX_OPERATION_ID_LENGTH} chars`);
  }

  const payload = command.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [...errors, 'payload is required'], code: FILE_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }
  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') {
    errors.push('payload.workspaceId is required');
  }
  const type = command.commandType;
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) errors.push(`payload.${key} is server-authoritative and must not be supplied`);
  }
  for (const key of COMMAND_FORBIDDEN_KEYS[type] || []) {
    if (key in payload) errors.push(`payload.${key} is server-derived and must not be supplied for ${type}`);
  }

  if (type === FILE_COMMAND_TYPES.CREATE_FILE || type === FILE_COMMAND_TYPES.CREATE_FILE_VERSION) {
    validateNameLike(payload.name, 'name', errors, { required: type === FILE_COMMAND_TYPES.CREATE_FILE });
    validateNameLike(payload.displayName, 'displayName', errors, { required: false });
    const mime = validateMimeType(payload.mimeType);
    if (!mime.valid) errors.push(`payload.mimeType: ${mime.error}`);
    const size = validateFileSize(payload.size);
    if (!size.valid) errors.push(`payload.size: ${size.error}`);
    const sum = validateChecksum(payload.checksum);
    if (!sum.valid) errors.push(`payload.checksum: ${sum.error}`);
    validateMetadata(payload.metadata, errors);
  }

  if (type === FILE_COMMAND_TYPES.CREATE_FILE) {
    if (payload.source !== undefined) {
      if (!FILE_SOURCES[payload.source]) {
        errors.push(`payload.source must be a known File source`);
      } else if (!CLIENT_CLAIMABLE_FILE_SOURCES.includes(payload.source)) {
        errors.push(`payload.source '${payload.source}' is reserved for trusted producers`);
      }
    }
  }

  if (type === FILE_COMMAND_TYPES.CREATE_FILE_VERSION || type === FILE_COMMAND_TYPES.ARCHIVE_FILE || type === FILE_COMMAND_TYPES.RESTORE_FILE) {
    if (!payload.fileId || typeof payload.fileId !== 'string') errors.push('payload.fileId is required');
  }

  if (type === FILE_COMMAND_TYPES.ATTACH_FILE) {
    if (!payload.fileId || typeof payload.fileId !== 'string') errors.push('payload.fileId is required');
    if (!payload.targetType || !ATTACHMENT_TARGET_TYPES[payload.targetType]) {
      errors.push('payload.targetType must be a supported attachment target type');
    }
    if (!payload.targetId || typeof payload.targetId !== 'string') errors.push('payload.targetId is required');
  }

  if (type === FILE_COMMAND_TYPES.DETACH_FILE) {
    if (!payload.attachmentId || typeof payload.attachmentId !== 'string') {
      errors.push('payload.attachmentId is required');
    }
  }

  if (payloadByteSize(payload) > MAX_FILE_SIZE_BYTES) {
    errors.push('payload exceeds maximum command size');
  }

  if (errors.length) {
    return { valid: false, errors, code: FILE_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }
  return { valid: true, errors: [] };
}

function envelope(commandType, operationId, payload) {
  return Object.freeze({
    contractVersion: FILE_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType,
    payload: Object.freeze({ ...payload }),
  });
}

/** CREATE_FILE — register canonical File at version 1. */
export function buildCreateFileCommand({ operationId, workspaceId, name, displayName, mimeType, size, checksum, source, metadata }) {
  return envelope(FILE_COMMAND_TYPES.CREATE_FILE, operationId, {
    workspaceId, name, displayName, mimeType, size, checksum, source, metadata,
  });
}

/** CREATE_FILE_VERSION — append version N+1 to an existing File. */
export function buildCreateFileVersionCommand({ operationId, workspaceId, fileId, name, displayName, mimeType, size, checksum, metadata }) {
  return envelope(FILE_COMMAND_TYPES.CREATE_FILE_VERSION, operationId, {
    workspaceId, fileId, name, displayName, mimeType, size, checksum, metadata,
  });
}

/** ATTACH_FILE — relate a File to RECORD or ENTITY. */
export function buildAttachFileCommand({ operationId, workspaceId, fileId, targetType, targetId }) {
  return envelope(FILE_COMMAND_TYPES.ATTACH_FILE, operationId, {
    workspaceId, fileId, targetType, targetId,
  });
}

/** DETACH_FILE — detach an Attachment (relationship history is preserved). */
export function buildDetachFileCommand({ operationId, workspaceId, attachmentId }) {
  return envelope(FILE_COMMAND_TYPES.DETACH_FILE, operationId, { workspaceId, attachmentId });
}

/** ARCHIVE_FILE — ACTIVE → ARCHIVED (reversible, evidence-preserving). */
export function buildArchiveFileCommand({ operationId, workspaceId, fileId }) {
  return envelope(FILE_COMMAND_TYPES.ARCHIVE_FILE, operationId, { workspaceId, fileId });
}

/** RESTORE_FILE — ARCHIVED → ACTIVE. */
export function buildRestoreFileCommand({ operationId, workspaceId, fileId }) {
  return envelope(FILE_COMMAND_TYPES.RESTORE_FILE, operationId, { workspaceId, fileId });
}
