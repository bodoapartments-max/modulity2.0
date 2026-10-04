/**
 * Modulity 2.0 — Trusted Administration Command Contract (Step 17.3)
 *
 * Versioned, server-authoritative command envelope for ADMINISTRATION of
 * protected business configuration: Entity Types, Entities, Modules and
 * Module Categories. Browsers collect intent; this boundary decides.
 *
 * Identity discipline:
 *   internalId (immutable) != technical code (stable, generated) != displayName (editable).
 *
 * All commands run server-side with:
 *   authentication → workspace authorization (USE != ADMINISTER) →
 *   validation → dependency analysis where destructive → single-transaction
 *   mutation + durable before/after Audit + operation journal idempotency.
 *
 * @module core/admin/adminCommandContract
 */

export const ADMIN_COMMAND_CONTRACT_VERSION = '1.0.0';
export const SUPPORTED_ADMIN_CONTRACT_VERSIONS = Object.freeze(['1.0.0']);

export const ADMIN_RESOURCES = Object.freeze({
  ENTITY_TYPE: 'ENTITY_TYPE',
  ENTITY: 'ENTITY',
  MODULE: 'MODULE',
  MODULE_CATEGORY: 'MODULE_CATEGORY',
});

export const ADMIN_COMMAND_TYPES = Object.freeze({
  // Entity Type
  CREATE_ENTITY_TYPE: 'CREATE_ENTITY_TYPE',
  UPDATE_ENTITY_TYPE: 'UPDATE_ENTITY_TYPE',
  ARCHIVE_ENTITY_TYPE: 'ARCHIVE_ENTITY_TYPE',
  RESTORE_ENTITY_TYPE: 'RESTORE_ENTITY_TYPE',
  DELETE_ENTITY_TYPE: 'DELETE_ENTITY_TYPE',
  // Entity
  CREATE_ENTITY: 'CREATE_ENTITY',
  UPDATE_ENTITY: 'UPDATE_ENTITY',
  ARCHIVE_ENTITY: 'ARCHIVE_ENTITY',
  RESTORE_ENTITY: 'RESTORE_ENTITY',
  DELETE_ENTITY: 'DELETE_ENTITY',
  // Module
  CREATE_MODULE: 'CREATE_MODULE',
  UPDATE_MODULE_METADATA: 'UPDATE_MODULE_METADATA',
  ARCHIVE_MODULE: 'ARCHIVE_MODULE',
  RESTORE_MODULE: 'RESTORE_MODULE',
  DELETE_MODULE: 'DELETE_MODULE',
  // Module Category
  CREATE_MODULE_CATEGORY: 'CREATE_MODULE_CATEGORY',
  UPDATE_MODULE_CATEGORY: 'UPDATE_MODULE_CATEGORY',
  ARCHIVE_MODULE_CATEGORY: 'ARCHIVE_MODULE_CATEGORY',
  RESTORE_MODULE_CATEGORY: 'RESTORE_MODULE_CATEGORY',
  DELETE_MODULE_CATEGORY: 'DELETE_MODULE_CATEGORY',
});

export const ADMIN_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  ADMIN_FORBIDDEN: 'ADMIN_FORBIDDEN',
  COMMAND_INVALID: 'COMMAND_INVALID',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  DEPENDENCY_BLOCKED: 'DEPENDENCY_BLOCKED',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

/** Payload keys only the trusted server may supply — never client-forgeable. */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor', 'actorId', 'userId', 'createdBy', 'createdAt', 'updatedAt',
  'archivedBy', 'archivedAt', 'restoredBy', 'restoredAt', 'deletedBy',
  'deletedAt', 'categoryCode', 'entityCode',
]);
// moduleCode is NOT forbidden here: users may propose one on CREATE_MODULE;
// the server validates format + collision and derives when absent.

/**
 * Resource targeting uses payload.resourceId (NOT the document's own
 * identity keys — those are never client-controlled).
 * entityTypeId is a legitimate reference on CREATE_ENTITY/UPDATE_ENTITY.
 * moduleId is a legitimate reference on CREATE_MODULE (Ledger/Module links).
 */
const TARGETED_COMMANDS = new Set([
  ADMIN_COMMAND_TYPES.UPDATE_ENTITY_TYPE,
  ADMIN_COMMAND_TYPES.ARCHIVE_ENTITY_TYPE,
  ADMIN_COMMAND_TYPES.RESTORE_ENTITY_TYPE,
  ADMIN_COMMAND_TYPES.DELETE_ENTITY_TYPE,
  ADMIN_COMMAND_TYPES.UPDATE_ENTITY,
  ADMIN_COMMAND_TYPES.ARCHIVE_ENTITY,
  ADMIN_COMMAND_TYPES.RESTORE_ENTITY,
  ADMIN_COMMAND_TYPES.DELETE_ENTITY,
  ADMIN_COMMAND_TYPES.UPDATE_MODULE_METADATA,
  ADMIN_COMMAND_TYPES.ARCHIVE_MODULE,
  ADMIN_COMMAND_TYPES.RESTORE_MODULE,
  ADMIN_COMMAND_TYPES.DELETE_MODULE,
  ADMIN_COMMAND_TYPES.UPDATE_MODULE_CATEGORY,
  ADMIN_COMMAND_TYPES.ARCHIVE_MODULE_CATEGORY,
  ADMIN_COMMAND_TYPES.RESTORE_MODULE_CATEGORY,
  ADMIN_COMMAND_TYPES.DELETE_MODULE_CATEGORY,
]);

/**
 * @param {*} command
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateAdminCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'], code: ADMIN_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (!SUPPORTED_ADMIN_CONTRACT_VERSIONS.includes(command.contractVersion)) {
    return {
      valid: false,
      errors: [`Unsupported contract version: ${command.contractVersion}`],
      code: ADMIN_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION,
    };
  }
  if (!command.commandType || !ADMIN_COMMAND_TYPES[command.commandType]) {
    return { valid: false, errors: [`Unsupported command type: ${command.commandType}`], code: ADMIN_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  if (!command.operationId || typeof command.operationId !== 'string' || command.operationId.length > 128) {
    errors.push('operationId is required and must be a short string');
  }
  const payload = command.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [...errors, 'payload is required'], code: ADMIN_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') errors.push('payload.workspaceId is required');
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) errors.push(`payload.${key} is server-authoritative and must not be supplied`);
  }
  if (TARGETED_COMMANDS.has(command.commandType)) {
    if (!payload.resourceId || typeof payload.resourceId !== 'string') {
      errors.push('payload.resourceId is required for targeted commands');
    }
  }

  if (errors.length) {
    return { valid: false, errors, code: ADMIN_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  return { valid: true, errors: [] };
}

function baseCommand(commandType, { operationId, workspaceId, ...rest }) {
  return Object.freeze({
    contractVersion: ADMIN_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType,
    payload: Object.freeze({ workspaceId, ...rest }),
  });
}

export function buildAdminCommand(commandType, params) {
  return baseCommand(commandType, params);
}
