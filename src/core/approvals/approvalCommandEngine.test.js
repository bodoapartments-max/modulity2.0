/**
 * Pure approval command engine tests (Step 31)
 * Deterministic transitions — multi-step, quorums, decision evidence.
 */
import { describe, it, expect } from 'vitest';
import {
  snapshotSteps,
  buildApprovalCaseFromCommand,
  applyDecisionToCase,
  buildCancellationPatch,
  buildExpiryPatch,
  buildExecutionMarkerPatch,
} from './approvalCommandEngine.js';
import { createApprovalCase, APPROVAL_STATUSES } from './approvalCase.js';
import { APPROVAL_STEP_STATUSES, APPROVAL_QUORUM_POLICIES } from './approvalConstraints.js';
import { buildCreateApprovalCommand } from './approvalCommandContract.js';

const T0 = '2026-10-16T10:00:00.000Z';
const T1 = '2026-10-16T11:00:00.000Z';

const recordAction = { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: { recordId: 'r1' } } };

function pendingCase({ quorum = APPROVAL_QUORUM_POLICIES.ANY_ONE, approvers = ['u2'], extraSteps = [] } = {}) {
  return createApprovalCase({
    approvalCaseId: 'appr_op1', workspaceId: 'ws1',
    requestType: 'TRUSTED_COMMAND', title: 't',
    proposedAction: recordAction, proposalFingerprint: 'fp',
    requestedBy: { actorType: 'USER', actorId: 'u1' },
    steps: [
      { stepIndex: 0, name: null, quorum, status: 'PENDING', assignments: approvers.map((id) => ({ approverUserId: id, status: 'PENDING', decisionId: null })) },
      ...extraSteps,
    ],
    now: T0,
  });
}

describe('snapshotSteps', () => {
  it('pins step specs into frozen case steps', () => {
    const steps = snapshotSteps([
      { name: 'Manager', quorum: 'ANY_ONE', approverUserIds: ['m'] },
      { quorum: 'ALL', approverUserIds: ['f1', 'f2'] },
    ]);
    expect(steps[0].name).toBe('Manager');
    expect(steps[1].assignments).toHaveLength(2);
    expect(Object.isFrozen(steps[0])).toBe(true);
  });
});

describe('buildApprovalCaseFromCommand', () => {
  it('builds a deterministic case bound to subject revision + fingerprint', () => {
    const cmd = buildCreateApprovalCommand({
      operationId: 'op42', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND',
      title: 'Approve it', subject: { type: 'FILE', id: 'f_1' },
      proposedAction: recordAction, steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u2'] }],
    });
    const c = buildApprovalCaseFromCommand({
      command: cmd, actorId: 'u1',
      steps: snapshotSteps(cmd.payload.steps),
      subjectRevision: 'v3', proposalFingerprint: 'fp',
      definitionRef: { definitionId: 'apdef_1', version: 2 },
      now: T0,
    });
    expect(c.approvalCaseId).toBe('appr_op42');
    expect(c.requestedBy.actorId).toBe('u1');
    expect(c.subject.revision).toBe('v3');
    expect(c.definitionRef).toEqual({ definitionId: 'apdef_1', version: 2 });
    expect(c.correlationId).toBe('op42');
  });
});

describe('applyDecisionToCase — ANY_ONE', () => {
  it('final-step APPROVE resolves the case APPROVED', () => {
    const c = pendingCase();
    const r = applyDecisionToCase({ approvalCase: c, decision: 'APPROVE', operationId: 'opd', actorId: 'u2', now: T1 });
    expect(r.caseOutcome).toBe(APPROVAL_STATUSES.APPROVED);
    expect(r.patch.status).toBe(APPROVAL_STATUSES.APPROVED);
    expect(r.patch.resolvedAt).toBe(T1);
    expect(r.decision.decidedBy.actorId).toBe('u2');
    expect(r.decision.decisionId).toBe('dec_opd');
  });

  it('ANY_ONE approve skips other pending assignees on the step', () => {
    const c = pendingCase({ approvers: ['u2', 'u3'] });
    const r = applyDecisionToCase({ approvalCase: c, decision: 'APPROVE', operationId: 'opd', actorId: 'u2', now: T1 });
    const assigns = r.patch.steps[0].assignments;
    expect(assigns.find((a) => a.approverUserId === 'u3').status).toBe(APPROVAL_STEP_STATUSES.SKIPPED);
  });

  it('REJECT resolves the whole case REJECTED immediately', () => {
    const c = pendingCase({ approvers: ['u2', 'u3'] });
    const r = applyDecisionToCase({ approvalCase: c, decision: 'REJECT', operationId: 'opd', actorId: 'u2', now: T1 });
    expect(r.caseOutcome).toBe(APPROVAL_STATUSES.REJECTED);
    expect(r.patch.steps[0].status).toBe(APPROVAL_STEP_STATUSES.REJECTED);
  });
});

describe('applyDecisionToCase — ALL quorum', () => {
  it('stays PENDING until every assignee approves', () => {
    const c = pendingCase({ quorum: APPROVAL_QUORUM_POLICIES.ALL, approvers: ['u2', 'u3'] });
    const r1 = applyDecisionToCase({ approvalCase: c, decision: 'APPROVE', operationId: 'opd1', actorId: 'u2', now: T1 });
    expect(r1.caseOutcome).toBe('PENDING');
    expect(r1.stepOutcome).toBe('PENDING');

    const c2 = { ...c, decisions: r1.patch.decisions, steps: r1.patch.steps };
    const r2 = applyDecisionToCase({ approvalCase: c2, decision: 'APPROVE', operationId: 'opd2', actorId: 'u3', now: T1 });
    expect(r2.caseOutcome).toBe(APPROVAL_STATUSES.APPROVED);
    expect(r2.patch.decisions).toHaveLength(2);
  });

  it('one REJECT in an ALL step resolves the case REJECTED', () => {
    const c = pendingCase({ quorum: APPROVAL_QUORUM_POLICIES.ALL, approvers: ['u2', 'u3'] });
    const r = applyDecisionToCase({ approvalCase: c, decision: 'REJECT', operationId: 'opd', actorId: 'u3', now: T1 });
    expect(r.caseOutcome).toBe(APPROVAL_STATUSES.REJECTED);
  });
});

describe('multi-step progression', () => {
  const twoStep = () => pendingCase({
    approvers: ['u2'],
    extraSteps: [{ stepIndex: 1, name: 'Finance', quorum: 'ALL', status: 'PENDING', assignments: [{ approverUserId: 'u9', status: 'PENDING', decisionId: null }] }],
  });

  it('non-final approve advances currentStepIndex without resolving', () => {
    const r = applyDecisionToCase({ approvalCase: twoStep(), decision: 'APPROVE', operationId: 'opd', actorId: 'u2', now: T1 });
    expect(r.caseOutcome).toBe('ADVANCED');
    expect(r.patch.currentStepIndex).toBe(1);
    expect(r.patch.status).toBeUndefined();
  });

  it('final step only resolves APPROVED', () => {
    const first = applyDecisionToCase({ approvalCase: twoStep(), decision: 'APPROVE', operationId: 'op1', actorId: 'u2', now: T1 });
    const advanced = { ...twoStep(), ...first.patch, status: 'PENDING' };
    const second = applyDecisionToCase({ approvalCase: advanced, decision: 'APPROVE', operationId: 'op2', actorId: 'u9', now: T1 });
    expect(second.caseOutcome).toBe(APPROVAL_STATUSES.APPROVED);
    expect(second.patch.decisions).toHaveLength(2);
  });
});

describe('terminal patches', () => {
  it('cancellation preserves history and resolves', () => {
    const patch = buildCancellationPatch({ now: T1 });
    expect(patch.status).toBe(APPROVAL_STATUSES.CANCELLED);
    expect(patch.resolvedAt).toBe(T1);
  });

  it('expiry resolves EXPIRED', () => {
    expect(buildExpiryPatch({ now: T1 }).status).toBe(APPROVAL_STATUSES.EXPIRED);
  });

  it('execution marker records the trusted action result path', () => {
    const patch = buildExecutionMarkerPatch({ resourcePath: 'records/r1', now: T1 });
    expect(patch['execution.status']).toBe('EXECUTED');
    expect(patch['execution.resultResourcePath']).toBe('records/r1');
  });
});
