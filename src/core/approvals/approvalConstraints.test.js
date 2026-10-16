/**
 * Approval constraints unit tests (Step 31)
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalProposalMaterial,
  approvalSubjectDocPath,
  subjectRevisionOf,
  approvalCaseIdFor,
  decisionIdFor,
  executionOperationIdFor,
  isValidApprovalCaseId,
  isSafeId,
  isValidIsoTimestamp,
  APPROVAL_SUBJECT_TYPES,
} from './approvalConstraints.js';

describe('canonicalProposalMaterial', () => {
  it('binds requestType + subject identity/revision + proposed action', () => {
    const m = canonicalProposalMaterial({
      requestType: 'TRUSTED_COMMAND',
      subject: { type: 'FILE', id: 'f1', revision: 'v3' },
      proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'X', payload: {} } },
    });
    expect(m.subject).toEqual({ type: 'FILE', id: 'f1', revision: 'v3' });
    expect(m.proposedAction.actionType).toBe('RECORD_COMMAND');
  });

  it('a subject-revision change changes the material (stale protection)', () => {
    const a = canonicalProposalMaterial({ requestType: 'T', subject: { type: 'FILE', id: 'f', revision: 'v3' }, proposedAction: {} });
    const b = canonicalProposalMaterial({ requestType: 'T', subject: { type: 'FILE', id: 'f', revision: 'v4' }, proposedAction: {} });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('missing subject maps to NONE', () => {
    const m = canonicalProposalMaterial({ requestType: 'T', subject: null, proposedAction: {} });
    expect(m.subject.type).toBe(APPROVAL_SUBJECT_TYPES.NONE);
  });
});

describe('approvalSubjectDocPath (closed path registry)', () => {
  it('resolves canonical workspace-scoped paths only', () => {
    expect(approvalSubjectDocPath('RECORD', 'ws1', 'r1')).toBe('workspaces/ws1/records/r1');
    expect(approvalSubjectDocPath('ENTITY', 'ws1', 'e1')).toBe('workspaces/ws1/entities/e1');
    expect(approvalSubjectDocPath('FILE', 'ws1', 'f1')).toBe('workspaces/ws1/files/f1');
  });

  it('rejects unknown subject types — never arbitrary paths', () => {
    expect(approvalSubjectDocPath('../../../secrets', 'ws1', 'x')).toBeNull();
    expect(approvalSubjectDocPath('NONE', 'ws1', 'x')).toBeNull();
  });
});

describe('subjectRevisionOf', () => {
  it('pins FILE subjects to their currentVersion', () => {
    expect(subjectRevisionOf('FILE', { currentVersion: 3 })).toBe('v3');
    expect(subjectRevisionOf('FILE', { currentVersion: 4 })).toBe('v4');
  });

  it('uses updatedAt for RECORD/ENTITY subjects', () => {
    expect(subjectRevisionOf('RECORD', { updatedAt: '2026-10-16T00:00:00Z' })).toBe('u2026-10-16T00:00:00Z');
  });

  it('returns null for missing docs', () => {
    expect(subjectRevisionOf('RECORD', null)).toBeNull();
  });
});

describe('deterministic ids', () => {
  it('derives case/decision/execution ids from operationId', () => {
    expect(approvalCaseIdFor('op9')).toBe('appr_op9');
    expect(decisionIdFor('op9')).toBe('dec_op9');
    expect(executionOperationIdFor('op9')).toBe('exec_op9');
  });

  it('validates approval case ids', () => {
    expect(isValidApprovalCaseId('appr_abc-123')).toBe(true);
    expect(isValidApprovalCaseId('not-prefixed')).toBe(false);
    expect(isValidApprovalCaseId(42)).toBe(false);
    expect(isValidApprovalCaseId('appr_with/slash')).toBe(false);
  });

  it('isSafeId rejects path traversal', () => {
    expect(isSafeId('ok_id-1')).toBe(true);
    expect(isSafeId('../../etc')).toBe(false);
    expect(isSafeId('a/b')).toBe(false);
  });

  it('isValidIsoTimestamp', () => {
    expect(isValidIsoTimestamp('2026-10-20T18:00:00.000Z')).toBe(true);
    expect(isValidIsoTimestamp('not-a-date')).toBe(false);
  });
});
