/**
 * ApprovalCase model + lifecycle unit tests (Step 31)
 */
import { describe, it, expect } from 'vitest';
import {
  createApprovalCase,
  createApprovalStep,
  createApprovalDecision,
  isTerminalApprovalStatus,
  isPendingAssignee,
  currentApproverIds,
  currentStepOf,
  APPROVAL_STATUSES,
  TERMINAL_APPROVAL_STATUSES,
  EXECUTION_STATUSES,
} from './approvalCase.js';
import {
  APPROVAL_REQUEST_TYPES,
  APPROVAL_SUBJECT_TYPES,
  APPROVAL_STEP_STATUSES,
  APPROVAL_QUORUM_POLICIES,
  SELF_APPROVAL_POLICIES,
} from './approvalConstraints.js';

const NOW = '2026-10-16T12:00:00.000Z';

function baseCase(overrides = {}) {
  return createApprovalCase({
    approvalCaseId: 'appr_op1',
    workspaceId: 'ws1',
    requestType: APPROVAL_REQUEST_TYPES.TRUSTED_COMMAND,
    title: 'Test approval',
    proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: { recordId: 'r1' } } },
    proposalFingerprint: 'abc123',
    requestedBy: { actorType: 'USER', actorId: 'u1' },
    steps: [createApprovalStep({ stepIndex: 0, quorum: APPROVAL_QUORUM_POLICIES.ANY_ONE, approverUserIds: ['u2'] })],
    now: NOW,
    ...overrides,
  });
}

describe('createApprovalCase', () => {
  it('builds a PENDING case at step 0 with empty decisions', () => {
    const c = baseCase();
    expect(c.status).toBe(APPROVAL_STATUSES.PENDING);
    expect(c.currentStepIndex).toBe(0);
    expect(c.decisions).toEqual([]);
    expect(c.execution.status).toBe(EXECUTION_STATUSES.PENDING_EXECUTION);
    expect(c.resolvedAt).toBeNull();
    expect(c.selfApprovalPolicy).toBe(SELF_APPROVAL_POLICIES.FORBID);
  });

  it('requires the closed requestType registry', () => {
    expect(() => baseCase({ requestType: 'HOLIDAY_REQUEST' })).toThrow(/requestType/);
  });

  it('defaults a missing subject to the NONE subject', () => {
    const c = baseCase();
    expect(c.subject.type).toBe(APPROVAL_SUBJECT_TYPES.NONE);
  });

  it('rejects unknown subject types (closed registry — no arbitrary paths)', () => {
    expect(() => baseCase({ subject: { type: 'firestore/path/thing', id: 'x' } })).toThrow(/subject type/);
  });

  it('accepts a FILE subject with a pinned revision', () => {
    const c = baseCase({ subject: { type: APPROVAL_SUBJECT_TYPES.FILE, id: 'f_1', revision: 'v3' } });
    expect(c.subject.revision).toBe('v3');
  });

  it('rejects an empty steps array', () => {
    expect(() => baseCase({ steps: [] })).toThrow(/steps/);
  });

  it('is immutable', () => {
    const c = baseCase();
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.steps[0])).toBe(true);
  });
});

describe('createApprovalStep', () => {
  it('creates PENDING assignments for every approver', () => {
    const s = createApprovalStep({ stepIndex: 0, quorum: APPROVAL_QUORUM_POLICIES.ALL, approverUserIds: ['u2', 'u3'] });
    expect(s.status).toBe(APPROVAL_STEP_STATUSES.PENDING);
    expect(s.assignments).toHaveLength(2);
    expect(s.assignments.map((a) => a.approverUserId)).toEqual(['u2', 'u3']);
    expect(s.assignments.every((a) => a.status === APPROVAL_STEP_STATUSES.PENDING)).toBe(true);
  });

  it('rejects empty approver lists', () => {
    expect(() => createApprovalStep({ stepIndex: 0, quorum: 'ANY_ONE', approverUserIds: [] })).toThrow();
  });
});

describe('lifecycle', () => {
  it('marks APPROVED/REJECTED/CANCELLED/EXPIRED terminal and PENDING non-terminal', () => {
    expect(isTerminalApprovalStatus(APPROVAL_STATUSES.PENDING)).toBe(false);
    for (const s of TERMINAL_APPROVAL_STATUSES) expect(isTerminalApprovalStatus(s)).toBe(true);
  });

  it('currentStepOf returns the pending step and null for resolved cases', () => {
    const c = baseCase();
    expect(currentStepOf(c).stepIndex).toBe(0);
    expect(currentStepOf({ ...c, status: APPROVAL_STATUSES.APPROVED })).toBeNull();
  });

  it('isPendingAssignee is true only for pending assignees on the current step', () => {
    const c = baseCase();
    expect(isPendingAssignee(c, 'u2')).toBe(true);
    expect(isPendingAssignee(c, 'u1')).toBe(false);
    expect(isPendingAssignee({ ...c, status: APPROVAL_STATUSES.APPROVED }, 'u2')).toBe(false);
  });

  it('currentApproverIds returns the current-step audience', () => {
    const c = baseCase({
      steps: [
        createApprovalStep({ stepIndex: 0, quorum: 'ANY_ONE', approverUserIds: ['u2'] }),
        createApprovalStep({ stepIndex: 1, quorum: 'ALL', approverUserIds: ['u3', 'u4'] }),
      ],
    });
    expect(currentApproverIds(c)).toEqual(['u2']);
    expect(currentApproverIds({ ...c, currentStepIndex: 1 })).toEqual(['u3', 'u4']);
  });
});

describe('createApprovalDecision', () => {
  it('records immutable actor/decision/time evidence', () => {
    const d = createApprovalDecision({
      decisionId: 'dec_1', stepIndex: 0,
      decidedBy: { actorType: 'USER', actorId: 'u2' },
      decision: 'APPROVE', decidedAt: NOW,
    });
    expect(d.decidedBy.actorId).toBe('u2');
    expect(Object.isFrozen(d)).toBe(true);
  });

  it('requires decidedBy and decidedAt — neither can be omitted', () => {
    expect(() => createApprovalDecision({ decisionId: 'd', stepIndex: 0, decision: 'APPROVE', decidedAt: NOW })).toThrow();
    expect(() => createApprovalDecision({ decisionId: 'd', stepIndex: 0, decidedBy: { actorId: 'u' }, decision: 'APPROVE' })).toThrow();
  });
});
