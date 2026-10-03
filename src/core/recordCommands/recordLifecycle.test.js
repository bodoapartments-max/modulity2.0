import { describe, it, expect } from 'vitest';
import { evaluateRecordTransition, RECORD_TRANSITIONS } from './recordLifecycle.js';
import { RECORD_COMMAND_TYPES, RECORD_COMMAND_ERROR_CODES } from './recordCommandContract.js';

const draft = { status: 'DRAFT' };
const submitted = { status: 'SUBMITTED' };
const archived = { status: 'ARCHIVED', _previousStatus: 'SUBMITTED' };
const cancelled = { status: 'CANCELLED' };

describe('recordLifecycle transition table', () => {
  it('allows DRAFT + SUBMIT_RECORD → SUBMITTED', () => {
    const result = evaluateRecordTransition(draft, RECORD_COMMAND_TYPES.SUBMIT_RECORD);
    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe('SUBMITTED');
  });

  it('denies SUBMIT_RECORD for non-DRAFT states', () => {
    for (const record of [submitted, archived, cancelled, { status: 'ACTIVE' }]) {
      const result = evaluateRecordTransition(record, RECORD_COMMAND_TYPES.SUBMIT_RECORD);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE);
    }
  });

  it('denies UPDATE_DRAFT for non-DRAFT states', () => {
    const result = evaluateRecordTransition(submitted, RECORD_COMMAND_TYPES.UPDATE_DRAFT);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE);
  });

  it('UPDATE_DRAFT keeps the current status', () => {
    expect(evaluateRecordTransition(draft, RECORD_COMMAND_TYPES.UPDATE_DRAFT).nextStatus).toBeNull();
  });

  it('restores the pre-archive status on RESTORE_RECORD', () => {
    const result = evaluateRecordTransition(archived, RECORD_COMMAND_TYPES.RESTORE_RECORD);
    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe('SUBMITTED');
  });

  it('RESTORE_RECORD falls back to ACTIVE when no previous status exists', () => {
    const result = evaluateRecordTransition({ status: 'ARCHIVED' }, RECORD_COMMAND_TYPES.RESTORE_RECORD);
    expect(result.nextStatus).toBe('ACTIVE');
  });

  it('ARCHIVE_RECORD is idempotent on an already-archived Record', () => {
    expect(evaluateRecordTransition(archived, RECORD_COMMAND_TYPES.ARCHIVE_RECORD).allowed).toBe(true);
    expect(evaluateRecordTransition(draft, RECORD_COMMAND_TYPES.ARCHIVE_RECORD).nextStatus).toBe('ARCHIVED');
  });

  it('denies CANCEL on cancelled or archived Records', () => {
    expect(evaluateRecordTransition(cancelled, RECORD_COMMAND_TYPES.CANCEL_RECORD).allowed).toBe(false);
    expect(evaluateRecordTransition(archived, RECORD_COMMAND_TYPES.CANCEL_RECORD).allowed).toBe(false);
  });

  it('denies SET_PRIORITY on terminal states', () => {
    expect(evaluateRecordTransition(cancelled, RECORD_COMMAND_TYPES.SET_PRIORITY).allowed).toBe(false);
    expect(evaluateRecordTransition(submitted, RECORD_COMMAND_TYPES.SET_PRIORITY).allowed).toBe(true);
  });

  it('rejects unknown commands with UNSUPPORTED_COMMAND', () => {
    const result = evaluateRecordTransition(draft, 'APPROVE_RECORD');
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  });

  it('no transition maps approve/reject/assign/complete — those engines are not implemented', () => {
    for (const command of ['APPROVE_RECORD', 'REJECT_RECORD', 'ASSIGN_RECORD', 'COMPLETE_RECORD']) {
      expect(RECORD_TRANSITIONS[command]).toBeUndefined();
    }
  });
});
