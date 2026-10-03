/**
 * Modulity 2.0 — Trusted Record Command Contract
 *
 * Versioned, server-authoritative command envelope for canonical Record
 * lifecycle operations.
 *
 * The command boundary is intentionally extensible: future actions such as
 * UPDATE_RECORD, APPROVE_RECORD, ASSIGN_RECORD, and COMPLETE_RECORD share the
 * same envelope but are NOT implemented in Step 12.
 *
 * @module core/recordCommands/recordCommandContract
 */

export const RECORD_COMMAND_CONTRACT_VERSION = '1.0.0';

export const RECORD_COMMAND_TYPES = Object.freeze({
  CREATE_RECORD: 'CREATE_RECORD',
  // Reserved for future milestones (not implemented in Step 12)
  UPDATE_RECORD: 'UPDATE_RECORD',
  SUBMIT_RECORD: 'SUBMIT_RECORD',
  ASSIGN_RECORD: 'ASSIGN_RECORD',
  APPROVE_RECORD: 'APPROVE_RECORD',
  REJECT_RECORD: 'REJECT_RECORD',
  COMPLETE_RECORD: 'COMPLETE_RECORD',
  CANCEL_RECORD: 'CANCEL_RECORD',
  ARCHIVE_RECORD: 'ARCHIVE_RECORD',
  RESTORE_RECORD: 'RESTORE_RECORD',
});

export const RECORD_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  MODULE_NOT_FOUND: 'MODULE_NOT_FOUND',
  MODULE_NOT_ACTIVE: 'MODULE_NOT_ACTIVE',
  MODULE_FORBIDDEN: 'MODULE_FORBIDDEN',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  RECORD_INVALID: 'RECORD_INVALID',
  ENTITY_REFERENCE_INVALID: 'ENTITY_REFERENCE_INVALID',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  OPERATION_INVALID: 'OPERATION_INVALID',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

/**
 * @typedef {Object} RecordCommand
 * @property {string} contractVersion
 * @property {string} operationId — stable idempotency key for the whole command
 * @property {string} commandType
 * @property {Object} payload
 * @property {string} payload.workspaceId
 * @property {string} payload.moduleId
 * @property {Object} payload.values — form field values
 * @property {boolean} [payload.isDraft]
 */

const MAX_OPERATION_ID_LENGTH = 128;
const MAX_VALUES_KEYS = 200;
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MiB

function hasExecutableShape(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  return (
    typeof value.script === 'string'
    || typeof value.eval === 'string'
    || typeof value.moduleUrl === 'string'
    || typeof value.expression === 'string'
    || typeof value.componentCode === 'string'
    || typeof value.jsx === 'string'
  );
}

function scanExecutable(value, path = '', found = []) {
  if (found.length > 0) return found;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('javascript:') || lower.includes('data:')) found.push(`${path}: suspicious string`);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanExecutable(v, `${path}[${i}]`, found));
    return found;
  }
  if (value && typeof value === 'object') {
    if (hasExecutableShape(value)) found.push(`${path}: executable shape rejected`);
    Object.entries(value).forEach(([k, v]) => scanExecutable(v, `${path}.${k}`, found));
  }
  return found;
}

function payloadByteSize(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Validates a RecordCommand envelope and payload structure.
 * Does NOT perform workspace/module/schema/value authority checks — those
 * belong to the server-side command engine.
 *
 * @param {RecordCommand} command
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateRecordCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'], code: RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }

  if (command.contractVersion !== RECORD_COMMAND_CONTRACT_VERSION) {
    return {
      valid: false,
      errors: [`Unsupported contract version: ${command.contractVersion}`],
      code: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION,
    };
  }

  if (!command.commandType || !RECORD_COMMAND_TYPES[command.commandType]) {
    return {
      valid: false,
      errors: [`Unsupported command type: ${command.commandType}`],
      code: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND,
    };
  }

  if (!command.operationId || typeof command.operationId !== 'string' || command.operationId.length > MAX_OPERATION_ID_LENGTH) {
    errors.push(`operationId is required and must be a string with max ${MAX_OPERATION_ID_LENGTH} chars`);
  }

  const payload = command.payload;
  if (!payload || typeof payload !== 'object') {
    errors.push('payload is required');
    return { valid: false, errors, code: RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }

  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') errors.push('payload.workspaceId is required');
  if (!payload.moduleId || typeof payload.moduleId !== 'string') errors.push('payload.moduleId is required');
  if (!payload.values || typeof payload.values !== 'object' || Array.isArray(payload.values)) {
    errors.push('payload.values must be an object');
  } else if (Object.keys(payload.values).length > MAX_VALUES_KEYS) {
    errors.push(`payload.values may contain at most ${MAX_VALUES_KEYS} keys`);
  }

  if (typeof payload.isDraft !== 'undefined' && typeof payload.isDraft !== 'boolean') {
    errors.push('payload.isDraft must be a boolean');
  }

  if (payloadByteSize(payload) > MAX_PAYLOAD_BYTES) {
    errors.push('payload exceeds maximum command size');
  }

  const executableIssues = scanExecutable(payload.values, 'values');
  if (executableIssues.length) errors.push(...executableIssues);

  if (errors.length) {
    return { valid: false, errors, code: RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }

  return { valid: true, errors: [] };
}

/**
 * Builds a CREATE_RECORD command envelope.
 *
 * @param {Object} params
 * @param {string} params.operationId
 * @param {string} params.workspaceId
 * @param {string} params.moduleId
 * @param {Object} params.values
 * @param {boolean} [params.isDraft]
 * @returns {RecordCommand}
 */
export function buildCreateRecordCommand({ operationId, workspaceId, moduleId, values = {}, isDraft = false }) {
  return Object.freeze({
    contractVersion: RECORD_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType: RECORD_COMMAND_TYPES.CREATE_RECORD,
    payload: Object.freeze({
      workspaceId,
      moduleId,
      values: Object.freeze({ ...values }),
      isDraft,
    }),
  });
}
