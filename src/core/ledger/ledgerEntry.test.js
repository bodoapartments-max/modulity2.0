import { describe, it, expect } from 'vitest';
import { createLedgerEntry, LEDGER_ENTRY_STATUSES } from './ledgerEntry.js';

const base = {
  ledgerEntryId: 'le-1',
  workspaceId: 'ws-1',
  ledgerBookId: 'lb-1',
  ledgerBlockId: 'block_1',
  recordId: 'rec-1',
  sequenceNumber: 1,
  referenceNumber: 'RI-2026-000001',
  registeredBy: { actorType: 'USER', actorId: 'u1' },
};

describe('createLedgerEntry', () => {
  it('creates a valid entry with defaults', () => {
    const e = createLedgerEntry(base);
    expect(e.entryStatus).toBe(LEDGER_ENTRY_STATUSES.ACTIVE);
    expect(e.moduleId).toBeNull();
    expect(e.moduleVersion).toBeNull();
    expect(e.cancelledAt).toBeNull();
    expect(e.cancelledBy).toBeNull();
    expect(e.voidedAt).toBeNull();
    expect(e.voidedBy).toBeNull();
    expect(e.supersededByRecordId).toBeNull();
    expect(Object.isFrozen(e)).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(() => createLedgerEntry({ ...base, ledgerEntryId: '' })).toThrow('ledgerEntryId');
    expect(() => createLedgerEntry({ ...base, workspaceId: '' })).toThrow('workspaceId');
    expect(() => createLedgerEntry({ ...base, ledgerBookId: '' })).toThrow('ledgerBookId');
    expect(() => createLedgerEntry({ ...base, ledgerBlockId: '' })).toThrow('ledgerBlockId');
    expect(() => createLedgerEntry({ ...base, recordId: '' })).toThrow('recordId');
    expect(() => createLedgerEntry({ ...base, referenceNumber: '' })).toThrow('referenceNumber');
    expect(() => createLedgerEntry({ ...base, registeredBy: null })).toThrow('registeredBy');
  });

  it('rejects invalid sequenceNumber', () => {
    expect(() => createLedgerEntry({ ...base, sequenceNumber: 0 })).toThrow('sequenceNumber');
    expect(() => createLedgerEntry({ ...base, sequenceNumber: -1 })).toThrow('sequenceNumber');
    expect(() => createLedgerEntry({ ...base, sequenceNumber: 1.5 })).toThrow('sequenceNumber');
  });

  it('rejects invalid entry status', () => {
    expect(() => createLedgerEntry({ ...base, entryStatus: 'INVALID' })).toThrow(
      'Invalid ledger entry status',
    );
  });

  it('accepts all valid statuses', () => {
    for (const s of Object.keys(LEDGER_ENTRY_STATUSES)) {
      expect(createLedgerEntry({ ...base, entryStatus: s }).entryStatus).toBe(s);
    }
  });

  it('accepts optional module provenance', () => {
    const e = createLedgerEntry({
      ...base,
      moduleId: 'mod-1',
      moduleVersion: 3,
      recordType: 'inspection',
    });
    expect(e.moduleId).toBe('mod-1');
    expect(e.moduleVersion).toBe(3);
    expect(e.recordType).toBe('inspection');
  });

  it('accepts cancellation metadata', () => {
    const e = createLedgerEntry({
      ...base,
      entryStatus: 'CANCELLED',
      cancelledAt: '2026-01-01T00:00:00Z',
      cancelledBy: { actorType: 'USER', actorId: 'u2' },
      cancellationReason: 'Duplicate entry',
    });
    expect(e.entryStatus).toBe('CANCELLED');
    expect(e.cancelledAt).toBe('2026-01-01T00:00:00Z');
    expect(e.cancelledBy.actorId).toBe('u2');
    expect(e.cancellationReason).toBe('Duplicate entry');
    expect(Object.isFrozen(e.cancelledBy)).toBe(true);
  });

  it('accepts void metadata', () => {
    const e = createLedgerEntry({
      ...base,
      entryStatus: 'VOIDED',
      voidedAt: '2026-01-01T00:00:00Z',
      voidedBy: { actorType: 'USER', actorId: 'u2' },
      voidReason: 'Error in original record',
    });
    expect(e.entryStatus).toBe('VOIDED');
    expect(e.voidedBy.actorId).toBe('u2');
    expect(Object.isFrozen(e.voidedBy)).toBe(true);
  });

  it('freezes registeredBy', () => {
    const e = createLedgerEntry(base);
    expect(Object.isFrozen(e.registeredBy)).toBe(true);
  });
});
