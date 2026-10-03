/**
 * Modulity 2.0 — Trusted Ledger Command Contract
 *
 * Versioned, server-authoritative command envelope for canonical Ledger
 * operations. Ledger Books and Ledger Entries are evidence infrastructure:
 * browsers may project them but must never author them.
 *
 * Implemented commands (Step 16):
 *   CREATE_LEDGER_BOOK    — trusted book bootstrap (code reservation + book +
 *                           initial block in one transaction)
 *   REGISTER_LEDGER_ENTRY — trusted sequence allocation + immutable entry +
 *                           Record linkage in one transaction
 *
 * NOT implemented (deferred): CANCEL_LEDGER_ENTRY, VOID_LEDGER_ENTRY,
 * CLOSE_LEDGER_BOOK. No client UI invoked them; the server boundary can add
 * them later without contract shape changes.
 *
 * The server always derives: actor, timestamps, sequence numbers, human
 * reference, block rollover and Record linkage. Payloads containing those
 * are rejected.
 *
 * @module core/ledger/ledgerCommandContract
 */

import { validateLedgerCode } from './ledgerBook.js';

export const LEDGER_COMMAND_CONTRACT_VERSION = '1.0.0';

export const LEDGER_COMMAND_TYPES = Object.freeze({
  CREATE_LEDGER_BOOK: 'CREATE_LEDGER_BOOK',
  REGISTER_LEDGER_ENTRY: 'REGISTER_LEDGER_ENTRY',
});

export const LEDGER_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  RECORD_NOT_ELIGIBLE: 'RECORD_NOT_ELIGIBLE',
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  BOOK_NOT_ACTIVE: 'BOOK_NOT_ACTIVE',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  CODE_CONFLICT: 'CODE_CONFLICT',
  COMMAND_INVALID: 'COMMAND_INVALID',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

/**
 * Payload keys that must never come from a browser — the trusted server
 * owns them.
 */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor', 'actorId', 'userId', 'registeredBy', 'createdBy',
  'registeredAt', 'createdAt', 'updatedAt', 'openedAt',
  'sequenceNumber', 'sequence', 'referenceNumber', 'reference',
  'ledgerBlockId', 'nextSequence', 'ledgerEntryId', 'blockNumber',
]);

export function validateLedgerCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'], code: LEDGER_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (command.contractVersion !== LEDGER_COMMAND_CONTRACT_VERSION) {
    return { valid: false, errors: [`Unsupported contract version: ${command.contractVersion}`], code: LEDGER_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION };
  }
  if (!command.commandType || !LEDGER_COMMAND_TYPES[command.commandType]) {
    return { valid: false, errors: [`Unsupported command type: ${command.commandType}`], code: LEDGER_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  if (!command.operationId || typeof command.operationId !== 'string' || command.operationId.length > 128) {
    errors.push('operationId is required and must be a short string');
  }

  const payload = command.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [...errors, 'payload is required'], code: LEDGER_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') errors.push('payload.workspaceId is required');
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload) errors.push(`payload.${key} is server-authoritative and must not be supplied`);
  }

  if (command.commandType === LEDGER_COMMAND_TYPES.REGISTER_LEDGER_ENTRY) {
    if (!payload.recordId || typeof payload.recordId !== 'string') errors.push('payload.recordId is required');
    if (!payload.ledgerBookId || typeof payload.ledgerBookId !== 'string') errors.push('payload.ledgerBookId is required');
  }

  if (command.commandType === LEDGER_COMMAND_TYPES.CREATE_LEDGER_BOOK) {
    if (!payload.name || typeof payload.name !== 'string') errors.push('payload.name is required');
    const codeCheck = validateLedgerCode(payload.ledgerCode);
    if (!codeCheck.valid) errors.push(...codeCheck.errors);
    if (payload.blockSize !== undefined) {
      if (typeof payload.blockSize !== 'number' || !Number.isInteger(payload.blockSize) || payload.blockSize < 1 || payload.blockSize > 10000) {
        errors.push('payload.blockSize must be an integer between 1 and 10000');
      }
    }
    for (const optionalText of ['description', 'referencePrefix']) {
      if (payload[optionalText] !== undefined && typeof payload[optionalText] !== 'string') {
        errors.push(`payload.${optionalText} must be a string`);
      }
    }
    for (const optionalRef of ['moduleId', 'recordType']) {
      if (payload[optionalRef] !== undefined && payload[optionalRef] !== null && typeof payload[optionalRef] !== 'string') {
        errors.push(`payload.${optionalRef} must be a string or null`);
      }
    }
  }

  if (errors.length) {
    return { valid: false, errors, code: LEDGER_COMMAND_ERROR_CODES.COMMAND_INVALID };
  }
  return { valid: true, errors: [] };
}

export function buildCreateLedgerBookCommand({ operationId, workspaceId, ledgerCode, name, description = '', moduleId = null, recordType = null, blockSize = 100, referencePrefix = '' }) {
  return Object.freeze({
    contractVersion: LEDGER_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType: LEDGER_COMMAND_TYPES.CREATE_LEDGER_BOOK,
    payload: Object.freeze({ workspaceId, ledgerCode, name, description, moduleId, recordType, blockSize, referencePrefix }),
  });
}

export function buildRegisterLedgerEntryCommand({ operationId, workspaceId, recordId, ledgerBookId }) {
  return Object.freeze({
    contractVersion: LEDGER_COMMAND_CONTRACT_VERSION,
    operationId,
    commandType: LEDGER_COMMAND_TYPES.REGISTER_LEDGER_ENTRY,
    payload: Object.freeze({ workspaceId, recordId, ledgerBookId }),
  });
}
