import { describe, expect, it } from 'vitest';
import { assertPlanApprovable, summarizePlanApplication } from './automatApplyContract.js';
import { fingerprintValue, normalizeForFingerprint } from './planIntegrity.js';

describe('Automat plan integrity and approval contract', () => {
  it('produces deterministic fingerprints independent of object key ordering', async () => {
    expect(normalizeForFingerprint({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(await fingerprintValue({ b: 2, a: 1 })).toBe(await fingerprintValue({ a: 1, b: 2 }));
    expect(await fingerprintValue({ a: 1 })).not.toBe(await fingerprintValue({ a: 2 }));
  });

  it('blocks invalid, conflicting, safe-update, and unresolved-required plans', () => {
    const base = { validation: { status: 'VALID', classifications: [] }, unresolvedQuestions: [] };
    expect(assertPlanApprovable(base)).toBe(true);
    expect(() => assertPlanApprovable({ ...base, validation: { status: 'INVALID', classifications: [] } })).toThrow('invalid');
    expect(() => assertPlanApprovable({ ...base, validation: { status: 'VALID', classifications: [{ operation: 'CONFLICT' }] } })).toThrow('conflicts');
    expect(() => assertPlanApprovable({ ...base, validation: { status: 'VALID', classifications: [{ operation: 'SAFE_UPDATE' }] } })).toThrow('conflicts');
    expect(() => assertPlanApprovable({ ...base, unresolvedQuestions: [{ category: 'REQUIRED_BEFORE_APPLY' }] })).toThrow('unresolved');
  });

  it('summarizes review classifications without destructive operations', () => {
    const summary = summarizePlanApplication({ classifications: [{ operation: 'CREATE' }, { operation: 'REUSE' }, { operation: 'UNSUPPORTED' }] });
    expect(summary).toMatchObject({ CREATE: 1, REUSE: 1, SAFE_UPDATE: 0, CONFLICT: 0, UNSUPPORTED: 1 });
    expect(summary).not.toHaveProperty('REPLACE_DELETE');
  });
});
