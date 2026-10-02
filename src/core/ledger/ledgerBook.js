/**
 * Modulity 2.0 — Ledger Book
 *
 * A numbered register/book. Examples: Vehicle Inspection Book 2026, Accident Register.
 * Multiple independent Ledger Books per workspace. Each has its own numbering sequence.
 *
 * LEDGER != RECORD != AUDIT. The Ledger assigns durable register identity to Records.
 *
 * @module core/ledger/ledgerBook
 */

export const LEDGER_BOOK_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
});

export const NUMBERING_STRATEGIES = Object.freeze({
  SEQUENTIAL: 'SEQUENTIAL',
});

/**
 * @typedef {Object} LedgerBook
 * @property {string} ledgerBookId
 * @property {string} workspaceId
 * @property {string} ledgerCode — unique per workspace, uppercase, like Module codes
 * @property {string} name
 * @property {string} description
 * @property {string|null} moduleId — optional Module scope
 * @property {string|null} recordType — optional Record Type scope
 * @property {string} status
 * @property {string} numberingStrategy
 * @property {number} blockSize — entries per block (e.g. 25, 50, 100, 500, 1000)
 * @property {string|null} currentBlockId
 * @property {string} referencePrefix — e.g. "VI", "ACC" for reference number formatting
 * @property {number} referenceFormatVersion
 * @property {Object} createdBy — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} closedAt
 * @property {Object|null} closedBy — ActorRef
 */

export function createLedgerBook({
  ledgerBookId,
  workspaceId,
  ledgerCode,
  name,
  description = '',
  moduleId = null,
  recordType = null,
  status = LEDGER_BOOK_STATUSES.ACTIVE,
  numberingStrategy = NUMBERING_STRATEGIES.SEQUENTIAL,
  blockSize = 100,
  currentBlockId = null,
  referencePrefix = '',
  referenceFormatVersion = 1,
  createdBy,
  createdAt,
  updatedAt,
  closedAt = null,
  closedBy = null,
}) {
  if (!ledgerBookId) throw new Error('ledgerBookId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!ledgerCode) throw new Error('ledgerCode is required');
  if (!name) throw new Error('name is required');
  if (!LEDGER_BOOK_STATUSES[status]) {
    throw new Error(`Invalid ledger book status: ${status}`);
  }
  if (!NUMBERING_STRATEGIES[numberingStrategy]) {
    throw new Error(`Invalid numbering strategy: ${numberingStrategy}`);
  }
  if (typeof blockSize !== 'number' || !Number.isInteger(blockSize) || blockSize < 1) {
    throw new Error('blockSize must be a positive integer');
  }
  if (blockSize > 10000) {
    throw new Error('blockSize cannot exceed 10000');
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    ledgerBookId,
    workspaceId,
    ledgerCode,
    name,
    description,
    moduleId,
    recordType,
    status,
    numberingStrategy,
    blockSize,
    currentBlockId,
    referencePrefix: referencePrefix || ledgerCode,
    referenceFormatVersion,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    closedAt,
    closedBy: closedBy ? Object.freeze({ ...closedBy }) : null,
  });
}

const LEDGER_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Validates a ledger code.
 * @param {string} code
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLedgerCode(code) {
  const errors = [];
  if (!code || typeof code !== 'string') {
    errors.push('Ledger code is required');
  } else if (!LEDGER_CODE_PATTERN.test(code)) {
    errors.push('Ledger code must be uppercase letters, digits, and underscores, starting with a letter');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Formats a human reference number from sequence.
 * Example: VI-2026-000001
 *
 * @param {string} prefix
 * @param {number} sequenceNumber
 * @param {number} [formatVersion=1]
 * @returns {string}
 */
export function formatReferenceNumber(prefix, sequenceNumber, formatVersion = 1) {
  if (formatVersion === 1) {
    const year = new Date().getFullYear();
    const padded = String(sequenceNumber).padStart(6, '0');
    return `${prefix}-${year}-${padded}`;
  }
  // Future format versions can be added here
  return `${prefix}-${String(sequenceNumber).padStart(6, '0')}`;
}
