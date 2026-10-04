import { describe, expect, it } from 'vitest';
import {
  LEDGER_SOURCE_TYPES,
  validateLedgerSourceDefinition,
  ledgerSourceMatchesRecord,
} from './ledgerSourceDefinition.js';

describe('ledgerSourceDefinition', () => {
  it('accepts null/undefined (source-less manual book)', () => {
    expect(validateLedgerSourceDefinition(null).valid).toBe(true);
    expect(validateLedgerSourceDefinition(undefined).valid).toBe(true);
  });

  it('accepts a MODULE source and freezes it', () => {
    const result = validateLedgerSourceDefinition({ type: 'MODULE', moduleId: 'm-1' });
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ type: 'MODULE', moduleId: 'm-1' });
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('rejects unknown source types — never arbitrary query config', () => {
    const result = validateLedgerSourceDefinition({ type: 'RAW_FIRESTORE_QUERY', collection: 'records', where: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('sourceDefinition.type'))).toBe(true);
  });

  it('rejects unsupported keys — no arbitrary configuration creep', () => {
    const result = validateLedgerSourceDefinition({ type: 'MODULE', moduleId: 'm-1', operator: '$where' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('operator'))).toBe(true);
  });

  it('requires moduleId for MODULE sources', () => {
    expect(validateLedgerSourceDefinition({ type: 'MODULE' }).valid).toBe(false);
    expect(validateLedgerSourceDefinition({ type: 'MODULE', moduleId: 123 }).valid).toBe(false);
  });

  it('matches Records for MODULE sources by canonical moduleId', () => {
    const src = { type: LEDGER_SOURCE_TYPES.MODULE, moduleId: 'm-1' };
    expect(ledgerSourceMatchesRecord(src, { moduleId: 'm-1' })).toBe(true);
    expect(ledgerSourceMatchesRecord(src, { moduleId: 'm-2' })).toBe(false);
    expect(ledgerSourceMatchesRecord(null, { moduleId: 'anything' })).toBe(true);
  });
});
