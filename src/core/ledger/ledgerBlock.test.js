import { describe, it, expect } from 'vitest';
import { createLedgerBlock, LEDGER_BLOCK_STATUSES } from './ledgerBlock.js';

const base = {
  ledgerBlockId: 'block_1',
  ledgerBookId: 'lb-1',
  workspaceId: 'ws-1',
  blockNumber: 1,
  startSequence: 1,
  endSequence: 100,
  nextSequence: 1,
  capacity: 100,
  createdBy: { actorType: 'USER', actorId: 'u1' },
};

describe('createLedgerBlock', () => {
  it('creates a valid block with defaults', () => {
    const b = createLedgerBlock(base);
    expect(b.status).toBe(LEDGER_BLOCK_STATUSES.OPEN);
    expect(b.closedAt).toBeNull();
    expect(Object.isFrozen(b)).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(() => createLedgerBlock({ ...base, ledgerBlockId: '' })).toThrow('ledgerBlockId');
    expect(() => createLedgerBlock({ ...base, ledgerBookId: '' })).toThrow('ledgerBookId');
    expect(() => createLedgerBlock({ ...base, workspaceId: '' })).toThrow('workspaceId');
    expect(() => createLedgerBlock({ ...base, createdBy: null })).toThrow('createdBy');
  });

  it('rejects invalid blockNumber', () => {
    expect(() => createLedgerBlock({ ...base, blockNumber: 0 })).toThrow('blockNumber');
    expect(() => createLedgerBlock({ ...base, blockNumber: -1 })).toThrow('blockNumber');
    expect(() => createLedgerBlock({ ...base, blockNumber: 1.5 })).toThrow('blockNumber');
  });

  it('rejects endSequence < startSequence', () => {
    expect(() => createLedgerBlock({ ...base, startSequence: 100, endSequence: 50 })).toThrow(
      'endSequence',
    );
  });

  it('rejects invalid status', () => {
    expect(() => createLedgerBlock({ ...base, status: 'BAD' })).toThrow(
      'Invalid ledger block status',
    );
  });

  it('accepts all valid statuses', () => {
    for (const s of Object.keys(LEDGER_BLOCK_STATUSES)) {
      expect(createLedgerBlock({ ...base, status: s }).status).toBe(s);
    }
  });
});
