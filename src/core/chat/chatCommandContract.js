/**
 * Modulity 2.0 — Trusted Chat Command Contract (Step 18)
 *
 * Browser-collected intent only; the server derives actor, timestamps,
 * membership and notification side effects.
 *
 * Commands:
 *   CREATE_DIRECT_CONVERSATION — deterministic DM between two members
 *   CREATE_CHANNEL              — named workspace channel
 *   CREATE_CONTEXT_CONVERSATION — lazy, idempotent context-bound conversation
 *   POST_MESSAGE                — server-authored message; raises notifications
 *   MARK_READ                   — per-user read cursor
 *   ARCHIVE_CONVERSATION        — admin-only lifecycle
 *
 * Idempotency: mutating commands carry an operationId; retries replay
 * journal results without duplicating Messages, Conversations or
 * Notifications.
 *
 * @module core/chat/chatCommandContract
 */

export const CHAT_COMMAND_CONTRACT_VERSION = '1.0.0';
export const SUPPORTED_CHAT_CONTRACT_VERSIONS = Object.freeze(['1.0.0']);

export const CHAT_COMMAND_TYPES = Object.freeze({
  CREATE_DIRECT_CONVERSATION: 'CREATE_DIRECT_CONVERSATION',
  CREATE_CHANNEL: 'CREATE_CHANNEL',
  CREATE_CONTEXT_CONVERSATION: 'CREATE_CONTEXT_CONVERSATION',
  POST_MESSAGE: 'POST_MESSAGE',
  MARK_READ: 'MARK_READ',
  ARCHIVE_CONVERSATION: 'ARCHIVE_CONVERSATION',
});

export const CHAT_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  COMMAND_INVALID: 'COMMAND_INVALID',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  NOT_MEMBER: 'NOT_MEMBER',
  CONTEXT_NOT_FOUND: 'CONTEXT_NOT_FOUND',
  CONTEXT_FORBIDDEN: 'CONTEXT_FORBIDDEN',
  INVALID_STATE: 'INVALID_STATE',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
});

/** Server-owned; never accepted from clients. */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor', 'actorId', 'userId', 'senderUserId', 'createdBy', 'createdAt',
  'updatedAt', '_createdAt', '_updatedAt', 'messageId',
]);

/**
 * conversationId is NOT forbidden: POST_MESSAGE/MARK_READ/ARCHIVE target an
 * existing Conversation by id — a referencing parameter, not an identity claim.
 */

export function validateChatCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'], code: CHAT_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (!SUPPORTED_CHAT_CONTRACT_VERSIONS.includes(command.contractVersion)) {
    return { valid: false, errors: [`Unsupported contract version: ${command.contractVersion}`], code: CHAT_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION };
  }
  if (!command.commandType || !CHAT_COMMAND_TYPES[command.commandType]) {
    return { valid: false, errors: [`Unsupported command type: ${command.commandType}`], code: CHAT_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  const payload = command.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [...errors, 'payload is required'], code: CHAT_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') errors.push('payload.workspaceId is required');
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) errors.push(`payload.${key} is server-authoritative and must not be supplied`);
  }

  if (command.commandType === CHAT_COMMAND_TYPES.CREATE_DIRECT_CONVERSATION && (!payload.targetUserId || typeof payload.targetUserId !== 'string')) errors.push('payload.targetUserId is required');
  if (command.commandType === CHAT_COMMAND_TYPES.CREATE_CHANNEL && (!payload.title?.trim?.() && !payload.title)) errors.push('payload.title is required');
  if (command.commandType === CHAT_COMMAND_TYPES.CREATE_CONTEXT_CONVERSATION && !payload.contextReference) errors.push('payload.contextReference is required');
  if (command.commandType === CHAT_COMMAND_TYPES.POST_MESSAGE) {
    if (!payload.conversationId) errors.push('payload.conversationId is required');
    if (!payload.content || !String(payload.content).trim()) errors.push('payload.content is required');
    if (String(payload.content || '').length > 4000) errors.push('payload.content exceeds 4000 characters');
  }
  if (command.commandType === CHAT_COMMAND_TYPES.MARK_READ && !payload.conversationId) errors.push('payload.conversationId is required');

  if (errors.length) return { valid: false, errors, code: CHAT_COMMAND_ERROR_CODES.COMMAND_INVALID };
  return { valid: true, errors: [] };
}

export function buildChatCommand(commandType, params) {
  const { operationId = null, workspaceId, ...rest } = params;
  return Object.freeze({
    contractVersion: CHAT_COMMAND_CONTRACT_VERSION,
    operationId: operationId || `chat_${Math.random().toString(36).slice(2, 18)}`,
    commandType,
    payload: Object.freeze({ workspaceId, ...rest }),
  });
}
