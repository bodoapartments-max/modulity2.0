/**
 * Modulity 2.0 — Ledger Entry
 *
 * An immutable registration in a Ledger Book.
 * References the canonical Record — does NOT duplicate Record.data.
 *
 * INVARIANTS:
 *   - A Ledger number, once allocated, is NEVER reused.
 *   - ONE Record may appear AT MOST ONCE in the same Ledger Book.
 *   - Cancelled/voided entries remain permanently visible.
 *   - Identity and numbering fields are immutable.
 *
 * @module core/ledger/ledgerEntry
 */

export const LEDGER_ENTRY_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  VOIDED: 'VOIDED',
  SUPERSEDED: 'SUPERSEDED',
});

/**
 * @typedef {Object} LedgerEntry
 * @property {string} ledgerEntryId
 * @property {string} workspaceId
 * @property {string} ledgerBookId
 * @property {string} ledgerBlockId
 * @property {string} recordId — reference to canonical Record
 * @property {string|null} moduleId
 * @property {number|null} moduleVersion
 * @property {string|null} recordType
 * @property {number} sequenceNumber — unique within ledger book, never reused
 * @property {string} referenceNumber — human-readable formatted reference
 * @property {number} referenceFormatVersion
 * @property {string} entryStatus
 * @property {string} registeredAt — server-authoritative timestamp
 * @property {Object} registeredBy — ActorRef
 * @property {string|null} cancelledAt
 * @property {Object|null} cancelledBy — ActorRef
 * @property {string|null} cancellationReason
 * @property {string|null} voidedAt
 * @property {Object|null} voidedBy — ActorRef
 * @property {string|null} voidReason
 * @property {string|null} supersededByRecordId
 */

export function createLedgerEntry({
  ledgerEntryId,
  workspaceId,
  ledgerBookId,
  ledgerBlockId,
  recordId,
  moduleId = null,
  moduleVersion = null,
  recordType = null,
  sequenceNumber,
  referenceNumber,
  referenceFormatVersion = 1,
  entryStatus = LEDGER_ENTRY_STATUSES.ACTIVE,
  registeredAt,
  registeredBy,
  cancelledAt = null,
  cancelledBy = null,
  cancellationReason = null,
  voidedAt = null,
  voidedBy = null,
  voidReason = null,
  supersededByRecordId = null,
}) {
  if (!ledgerEntryId) throw new Error('ledgerEntryId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!ledgerBookId) throw new Error('ledgerBookId is required');
  if (!ledgerBlockId) throw new Error('ledgerBlockId is required');
  if (!recordId) throw new Error('recordId is required');
  if (typeof sequenceNumber !== 'number' || !Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new Error('sequenceNumber must be a positive integer');
  }
  if (!referenceNumber) throw new Error('referenceNumber is required');
  if (!LEDGER_ENTRY_STATUSES[entryStatus]) {
    throw new Error(`Invalid ledger entry status: ${entryStatus}`);
  }
  if (!registeredBy) throw new Error('registeredBy is required');

  return Object.freeze({
    ledgerEntryId,
    workspaceId,
    ledgerBookId,
    ledgerBlockId,
    recordId,
    moduleId,
    moduleVersion,
    recordType,
    sequenceNumber,
    referenceNumber,
    referenceFormatVersion,
    entryStatus,
    registeredAt: registeredAt || new Date().toISOString(),
    registeredBy: Object.freeze({ ...registeredBy }),
    cancelledAt,
    cancelledBy: cancelledBy ? Object.freeze({ ...cancelledBy }) : null,
    cancellationReason,
    voidedAt,
    voidedBy: voidedBy ? Object.freeze({ ...voidedBy }) : null,
    voidReason,
    supersededByRecordId,
  });
}
