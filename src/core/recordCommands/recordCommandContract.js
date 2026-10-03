/**
 * Modulity 2.0 — Trusted Record Command Contract
 *
 * Versioned, server-authoritative command envelope for canonical Record
 * lifecycle operations.
 *
 * Implemented commands (Step 15):
 *   CREATE_RECORD  — trusted creation (Step 12)
 *   UPDATE_DRAFT   — trusted DRAFT content update (data + entity references)
 *   SUBMIT_RECORD  — trusted DRAFT → SUBMITTED transition
 *   SET_PRIORITY, ARCHIVE_RECORD, RESTORE_RECORD, CANCEL_RECORD
 *     — trusted operational/lifecycle mutations
 *
 * The envelope is extensible: APPROVE_RECORD / ASSIGN_RECORD /
 * COMPLETE_RECORD remain reserved for later milestones and are NOT
 * implemented.
 *
 * A Record action is a trusted domain command, not a UI button. The server
 * derives the actor, loads canonical state, validates the transition, and
 * performs the mutation. Browsers never send actor, status, or timestamp
 * targets.
 *
 * @module core/recordCommands/recordCommandContract
 */

import { RECORD_PRIORITIES } from '../data/record.js';

export const RECORD_COMMAND_CONTRACT_VERSION = '1.1.0';
/**
 * Accepted contract versions. 1.0.0 CREATE_RECORD clients remain compatible
 * with the 1.1.0 server; mutation commands were introduced in 1.1.0, and
 * older clients never send them.
 */
export const SUPPORTED_CONTRACT_VERSIONS = Object.freeze(['1.0.0', '1.1.0']);

export const RECORD_COMMAND_TYPES = Object.freeze({
  CREATE_RECORD: 'CREATE_RECORD',
  UPDATE_DRAFT: 'UPDATE_DRAFT',
  SUBMIT_RECORD: 'SUBMIT_RECORD',
  SET_PRIORITY: 'SET_PRIORITY',
  ARCHIVE_RECORD: 'ARCHIVE_RECORD',
  RESTORE_RECORD: 'RESTORE_RECORD',
  CANCEL_RECORD: 'CANCEL_RECORD',
  // Reserved for future milestones (not implemented)
  UPDATE_RECORD: 'UPDATE_RECORD',
  ASSIGN_RECORD: 'ASSIGN_RECORD',
  APPROVE_RECORD: 'APPROVE_RECORD',
  REJECT_RECORD: 'REJECT_RECORD',
  COMPLETE_RECORD: 'COMPLETE_RECORD',
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
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  INVALID_RECORD_STATE: 'INVALID_RECORD_STATE',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  ENTITY_REFERENCE_INVALID: 'ENTITY_REFERENCE_INVALID',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  OPERATION_INVALID: 'OPERATION_INVALID',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

/**
 * @typedef {Object} RecordCommand
 * @property {string} contractVersion
 * @property {string} operationId — stable idempotency key for the whole command
 * @property {string} commandType
 * @property {Object} payload
 * @property {string} payload.workspaceId
 * @property {string} [payload.moduleId] — CREATE_RECORD only
 * @property {string} [payload.recordId] — all mutation commands
 * @property {Object} [payload.values] — CREATE_RECORD / UPDATE_DRAFT
 * @property {boolean} [payload.isDraft] — CREATE_RECORD only
 * @property {string|null} [payload.priority] — SET_PRIORITY only (whitelist enforced server-side)
 */

const MAX_OPERATION_ID_LENGTH = 128;
const MAX_VALUES_KEYS = 200;
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MiB

/**
 * Commands that mutate an existing Record. All require payload.recordId.
 */
const RECORD_MUTATION_COMMAND_TYPES = new Set([
  RECORD_COMMAND_TYPES.UPDATE_DRAFT,
  RECORD_COMMAND_TYPES.SUBMIT_RECORD,
  RECORD_COMMAND_TYPES.SET_PRIORITY,
  RECORD_COMMAND_TYPES.ARCHIVE_RECORD,
  RECORD_COMMAND_TYPES.RESTORE_RECORD,
  RECORD_COMMAND_TYPES.CANCEL_RECORD,
]);

/**
 * Server-authoritative fields. Presence of any of these in a command payload
 * means the client attempted to override identity/lifecycle authority.
 */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor',
  'actorId',
  'userId',
  'createdBy',
  'submittedBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'submittedAt',
  'status',
  'statusTarget',
]);

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

  if (!SUPPORTED_CONTRACT_VERSIONS.includes(command.contractVersion)) {
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

  // Authority fields must never come from the client — the server derives
  // actor identity, lifecycle state, and timestamps.
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) errors.push(`payload.${key} is server-authoritative and must not be supplied`);
  }

  const commandType = command.commandType;

  if (RECORD_MUTATION_COMMAND_TYPES.has(commandType)) {
    if (!payload.recordId || typeof payload.recordId !== 'string') errors.push('payload.recordId is required');
  }
  if (commandType === RECORD_COMMAND_TYPES.CREATE_RECORD) {
    if (!payload.moduleId || typeof payload.moduleId !== 'string') errors.push('payload.moduleId is required');
  }
  if (commandType === RECORD_COMMAND_TYPES.CREATE_RECORD || commandType === RECORD_COMMAND_TYPES.UPDATE_DRAFT) {
    if (!payload.values || typeof payload.values !== 'object' || Array.isArray(payload.values)) {
      errors.push('payload.values must be an object');
    } else if (Object.keys(payload.values).length > MAX_VALUES_KEYS) {
      errors.push(`payload.values may contain at most ${MAX_VALUES_KEYS} keys`);
    }

    if (payload.values && typeof payload.values === 'object' && !Array.isArray(payload.values)) {
      const executableIssues = scanExecutable(payload.values, 'values');
      if (executableIssues.length) errors.push(...executableIssues);
    }
  }
  if (commandType === RECORD_COMMAND_TYPES.CREATE_RECORD) {
    if (typeof payload.isDraft !== 'undefined' && typeof payload.isDraft !== 'boolean') {
      errors.push('payload.isDraft must be a boolean');
    }
  }
  if (commandType === RECORD_COMMAND_TYPES.SET_PRIORITY) {
    if (payload.priority !== null && (typeof payload.priority !== 'string' || !RECORD_PRIORITIES[payload.priority])) {
      errors.push('payload.priority must be a valid priority value or null');
    }
  }

  if (payloadByteSize(payload) > MAX_PAYLOAD_BYTES) {
    errors.push('payload exceeds maximum command size');
  }

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

/** UPDATE_DRAFT — trusted content update of an existing DRAFT Record. */
export function buildUpdateDraftCommand({ operationId, workspaceId, recordId, values = {} }) {
  return Object.freeze({
    contractVersion: RECORD_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType: RECORD_COMMAND_TYPES.UPDATE_DRAFT,
    payload: Object.freeze({
      workspaceId,
      recordId,
      values: Object.freeze({ ...values }),
    }),
  });
}

function buildLifecycleCommand(commandType, { operationId, workspaceId, recordId }) {
  return Object.freeze({
    contractVersion: RECORD_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType,
    payload: Object.freeze({ workspaceId, recordId }),
  });
}

/** SUBMIT_RECORD — trusted DRAFT → SUBMITTED transition of an existing Record. */
export function buildSubmitRecordCommand(params) {
  return buildLifecycleCommand(RECORD_COMMAND_TYPES.SUBMIT_RECORD, params);
}

/** SET_PRIORITY — trusted priority change; payload.priority is a whitelist value or null. */
export function buildSetPriorityCommand({ operationId, workspaceId, recordId, priority = null }) {
  return Object.freeze({
    contractVersion: RECORD_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType: RECORD_COMMAND_TYPES.SET_PRIORITY,
    payload: Object.freeze({ workspaceId, recordId, priority }),
  });
}

/** ARCHIVE_RECORD — trusted archive of an existing Record. */
export function buildArchiveRecordCommand(params) {
  return buildLifecycleCommand(RECORD_COMMAND_TYPES.ARCHIVE_RECORD, params);
}

/** RESTORE_RECORD — trusted unarchive restoring the pre-archive status. */
export function buildRestoreRecordCommand(params) {
  return buildLifecycleCommand(RECORD_COMMAND_TYPES.RESTORE_RECORD, params);
}

/** CANCEL_RECORD — trusted cancellation of an existing Record. */
export function buildCancelRecordCommand(params) {
  return buildLifecycleCommand(RECORD_COMMAND_TYPES.CANCEL_RECORD, params);
}
