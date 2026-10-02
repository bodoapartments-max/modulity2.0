import { describe, it, expect } from 'vitest';
import {
  createLedgerBook,
  validateLedgerCode,
  formatReferenceNumber,
  LEDGER_BOOK_STATUSES,
  NUMBERING_STRATEGIES,
} from './ledgerBook.js';

const base = {
  ledgerBookId: 'lb-1',
  workspaceId: 'ws-1',
  ledgerCode: 'ROOM_INSPECTION',
  name: 'Room Inspection Register',
  createdBy: { actorType: 'USER', actorId: 'u1' },
};

describe('createLedgerBook', () => {
  it('creates a valid book with defaults', () => {
    const b = createLedgerBook(base);
    expect(b.ledgerBookId).toBe('lb-1');
    expect(b.status).toBe(LEDGER_BOOK_STATUSES.ACTIVE);
    expect(b.numberingStrategy).toBe(NUMBERING_STRATEGIES.SEQUENTIAL);
    expect(b.blockSize).toBe(100);
    expect(b.referencePrefix).toBe('ROOM_INSPECTION');
    expect(b.moduleId).toBeNull();
    expect(b.recordType).toBeNull();
    expect(b.closedAt).toBeNull();
    expect(Object.isFrozen(b)).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(() => createLedgerBook({ ...base, ledgerBookId: '' })).toThrow('ledgerBookId');
    expect(() => createLedgerBook({ ...base, workspaceId: '' })).toThrow('workspaceId');
    expect(() => createLedgerBook({ ...base, ledgerCode: '' })).toThrow('ledgerCode');
    expect(() => createLedgerBook({ ...base, name: '' })).toThrow('name');
    expect(() => createLedgerBook({ ...base, createdBy: null })).toThrow('createdBy');
  });

  it('rejects invalid status', () => {
    expect(() => createLedgerBook({ ...base, status: 'INVALID' })).toThrow(
      'Invalid ledger book status',
    );
  });

  it('rejects invalid numbering strategy', () => {
    expect(() => createLedgerBook({ ...base, numberingStrategy: 'RANDOM' })).toThrow(
      'Invalid numbering strategy',
    );
  });

  it('rejects invalid block size', () => {
    expect(() => createLedgerBook({ ...base, blockSize: 0 })).toThrow(
      'blockSize must be a positive integer',
    );
    expect(() => createLedgerBook({ ...base, blockSize: -1 })).toThrow(
      'blockSize must be a positive integer',
    );
    expect(() => createLedgerBook({ ...base, blockSize: 1.5 })).toThrow(
      'blockSize must be a positive integer',
    );
    expect(() => createLedgerBook({ ...base, blockSize: 10001 })).toThrow(
      'blockSize cannot exceed 10000',
    );
  });

  it('accepts custom block sizes', () => {
    expect(createLedgerBook({ ...base, blockSize: 25 }).blockSize).toBe(25);
    expect(createLedgerBook({ ...base, blockSize: 500 }).blockSize).toBe(500);
    expect(createLedgerBook({ ...base, blockSize: 1000 }).blockSize).toBe(1000);
  });

  it('uses referencePrefix or falls back to ledgerCode', () => {
    expect(createLedgerBook({ ...base, referencePrefix: 'RI' }).referencePrefix).toBe('RI');
    expect(createLedgerBook(base).referencePrefix).toBe('ROOM_INSPECTION');
  });

  it('accepts optional moduleId and recordType', () => {
    const b = createLedgerBook({ ...base, moduleId: 'mod-1', recordType: 'inspection' });
    expect(b.moduleId).toBe('mod-1');
    expect(b.recordType).toBe('inspection');
  });

  it('freezes createdBy', () => {
    const b = createLedgerBook(base);
    expect(Object.isFrozen(b.createdBy)).toBe(true);
  });
});

describe('validateLedgerCode', () => {
  it('accepts valid codes', () => {
    expect(validateLedgerCode('A').valid).toBe(true);
    expect(validateLedgerCode('ROOM_INSPECTION').valid).toBe(true);
    expect(validateLedgerCode('V2_INSP').valid).toBe(true);
  });

  it('rejects invalid codes', () => {
    expect(validateLedgerCode('').valid).toBe(false);
    expect(validateLedgerCode('lowercase').valid).toBe(false);
    expect(validateLedgerCode('2START').valid).toBe(false);
    expect(validateLedgerCode('HAS SPACE').valid).toBe(false);
  });
});

describe('formatReferenceNumber', () => {
  it('formats v1 reference with year and padded sequence', () => {
    const ref = formatReferenceNumber('RI', 1);
    const year = new Date().getFullYear();
    expect(ref).toBe(`RI-${year}-000001`);
  });

  it('pads up to 6 digits', () => {
    const ref = formatReferenceNumber('ACC', 42);
    expect(ref).toContain('-000042');
  });

  it('handles large sequence numbers', () => {
    const ref = formatReferenceNumber('VI', 999999);
    expect(ref).toContain('-999999');
  });
});
