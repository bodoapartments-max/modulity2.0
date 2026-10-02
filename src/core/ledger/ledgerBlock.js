/**
 * Modulity 2.0 — Ledger Block
 *
 * Represents a page/block in a Ledger Book.
 * Example: Block 1 = numbers 1-100, Block 2 = 101-200.
 * Block size is configurable per Ledger Book.
 *
 * @module core/ledger/ledgerBlock
 */

export const LEDGER_BLOCK_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  FULL: 'FULL',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
});

/**
 * @typedef {Object} LedgerBlock
 * @property {string} ledgerBlockId
 * @property {string} ledgerBookId
 * @property {string} workspaceId
 * @property {number} blockNumber — sequential block number (1, 2, 3...)
 * @property {number} startSequence — first sequence number in this block
 * @property {number} endSequence — last possible sequence number in this block
 * @property {number} nextSequence — next available sequence number
 * @property {number} capacity — max entries in this block
 * @property {string} status
 * @property {string} openedAt
 * @property {string|null} closedAt
 * @property {Object} createdBy — ActorRef
 */

export function createLedgerBlock({
  ledgerBlockId,
  ledgerBookId,
  workspaceId,
  blockNumber,
  startSequence,
  endSequence,
  nextSequence,
  capacity,
  status = LEDGER_BLOCK_STATUSES.OPEN,
  openedAt,
  closedAt = null,
  createdBy,
}) {
  if (!ledgerBlockId) throw new Error('ledgerBlockId is required');
  if (!ledgerBookId) throw new Error('ledgerBookId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (typeof blockNumber !== 'number' || !Number.isInteger(blockNumber) || blockNumber < 1) {
    throw new Error('blockNumber must be a positive integer');
  }
  if (typeof startSequence !== 'number' || !Number.isInteger(startSequence) || startSequence < 1) {
    throw new Error('startSequence must be a positive integer');
  }
  if (typeof endSequence !== 'number' || !Number.isInteger(endSequence) || endSequence < startSequence) {
    throw new Error('endSequence must be >= startSequence');
  }
  if (typeof nextSequence !== 'number' || !Number.isInteger(nextSequence)) {
    throw new Error('nextSequence must be an integer');
  }
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1) {
    throw new Error('capacity must be a positive integer');
  }
  if (!LEDGER_BLOCK_STATUSES[status]) {
    throw new Error(`Invalid ledger block status: ${status}`);
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    ledgerBlockId,
    ledgerBookId,
    workspaceId,
    blockNumber,
    startSequence,
    endSequence,
    nextSequence,
    capacity,
    status,
    openedAt: openedAt || new Date().toISOString(),
    closedAt,
    createdBy: Object.freeze({ ...createdBy }),
  });
}
