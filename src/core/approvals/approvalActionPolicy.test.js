/**
 * Approval action policy tests (Step 31)
 * Decision-time authorization, self-approval, expiry, stale-state.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateApprovalAction,
  validateApproverAssignments,
  isApprovalExpired,
  isProposalStale,
  resolveApprovalRequirement,
} from './approvalActionPolicy.js';
import { createApprovalCase, APPROVAL_STATUSES } from './approvalCase.js';
import { APPROVAL_COMMAND_TYPES, APPROVAL_COMMAND_ERROR_CODES } from './approvalCommandContract.js';
import { SELF_APPROVAL_POLICIES } from './approvalConstraints.js';

const NOW = '2026-10-16T12:00:00.000Z';
const ctx = { authenticated: true, workspaceAccess: 'ORGANIZATION_MEMBER' };
const actor = (id) => ({ actorType: 'USER', actorId: id });

function pendingCase(overrides = {}) {
  return createApprovalCase({
    approvalCaseId: 'appr_op1', workspaceId: 'ws1',
    requestType: 'TRUSTED_COMMAND', title: 't',
    proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: {} } },
    proposalFingerprint: 'fp',
    requestedBy: { actorType: 'USER', actorId: 'u1' },
    steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u2', status: 'PENDING', decisionId: null }] }],
    now: NOW,
    ...overrides,
  });
}

describe('evaluateApprovalAction — DECIDE', () => {
  it('allows an assigned approver on a pending case', () => {
    const r = evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u2'), approvalCase: pendingCase(), now: NOW });
    expect(r.allowed).toBe(true);
  });

  it('denies unauthenticated and non-member actors', () => {
    expect(evaluateApprovalAction({ actorContext: { authenticated: false }, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, approvalCase: pendingCase() }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.UNAUTHENTICATED);
    expect(evaluateApprovalAction({ actorContext: { authenticated: true, workspaceAccess: null }, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, approvalCase: pendingCase() }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN);
  });

  it('denies non-assigned users', () => {
    const r = evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u9'), approvalCase: pendingCase(), now: NOW });
    expect(r.reasonCode).toBe(APPROVAL_COMMAND_ERROR_CODES.NOT_ASSIGNED_APPROVER);
  });

  it('denies decisions on terminal cases', () => {
    const resolved = { ...pendingCase(), status: APPROVAL_STATUSES.APPROVED };
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u2'), approvalCase: resolved, now: NOW }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.INVALID_APPROVAL_STATE);
  });

  it('denies decisions after expiry (deterministic lazy expiry)', () => {
    const expiring = pendingCase({ expiresAt: '2026-10-16T11:00:00.000Z' });
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u2'), approvalCase: expiring, now: NOW }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_EXPIRED);
  });

  it('self-approval denied under FORBID even when requester is an assignee', () => {
    const c = createApprovalCase({
      approvalCaseId: 'appr_x', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND', title: 't',
      proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: {} } },
      proposalFingerprint: 'fp', requestedBy: { actorType: 'USER', actorId: 'u1' },
      steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u1', status: 'PENDING', decisionId: null }] }],
      selfApprovalPolicy: SELF_APPROVAL_POLICIES.FORBID,
      now: NOW,
    });
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u1'), approvalCase: c, now: NOW }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.SELF_APPROVAL_DENIED);
  });

  it('self-approval allowed under explicit ALLOW', () => {
    const c = createApprovalCase({
      approvalCaseId: 'appr_x', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND', title: 't',
      proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: {} } },
      proposalFingerprint: 'fp', requestedBy: { actorType: 'USER', actorId: 'u1' },
      steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u1', status: 'PENDING', decisionId: null }] }],
      selfApprovalPolicy: SELF_APPROVAL_POLICIES.ALLOW,
      now: NOW,
    });
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL, actor: actor('u1'), approvalCase: c, now: NOW }).allowed).toBe(true);
  });
});

describe('evaluateApprovalAction — CANCEL', () => {
  it('requester may cancel a pending case', () => {
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL, actor: actor('u1'), approvalCase: pendingCase(), now: NOW }).allowed).toBe(true);
  });

  it('personal owner may cancel; arbitrary members may not', () => {
    const c = pendingCase();
    expect(evaluateApprovalAction({ actorContext: { authenticated: true, workspaceAccess: 'PERSONAL_OWNER' }, action: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL, actor: actor('uX'), approvalCase: c, now: NOW }).allowed).toBe(true);
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL, actor: actor('u9'), approvalCase: c, now: NOW }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.CANCELLATION_FORBIDDEN);
  });

  it('cannot cancel a resolved case', () => {
    const c = { ...pendingCase(), status: APPROVAL_STATUSES.CANCELLED };
    expect(evaluateApprovalAction({ actorContext: ctx, action: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL, actor: actor('u1'), approvalCase: c, now: NOW }).reasonCode)
      .toBe(APPROVAL_COMMAND_ERROR_CODES.INVALID_APPROVAL_STATE);
  });
});

describe('validateApproverAssignments', () => {
  it('blocks requester self-assignment under FORBID', () => {
    const r = validateApproverAssignments({
      stepSpecs: [{ approverUserIds: ['u1', 'u2'] }],
      requesterUserId: 'u1',
      selfApprovalPolicy: SELF_APPROVAL_POLICIES.FORBID,
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCode).toBe(APPROVAL_COMMAND_ERROR_CODES.SELF_APPROVAL_DENIED);
  });

  it('allows requester assignment under ALLOW', () => {
    expect(validateApproverAssignments({
      stepSpecs: [{ approverUserIds: ['u1'] }],
      requesterUserId: 'u1',
      selfApprovalPolicy: SELF_APPROVAL_POLICIES.ALLOW,
    }).ok).toBe(true);
  });
});

describe('isApprovalExpired / isProposalStale', () => {
  it('expiry only applies to PENDING cases past expiresAt', () => {
    const c = pendingCase({ expiresAt: '2026-10-16T11:00:00.000Z' });
    expect(isApprovalExpired(c, NOW)).toBe(true);
    expect(isApprovalExpired({ ...c, status: APPROVAL_STATUSES.APPROVED }, NOW)).toBe(false);
    expect(isApprovalExpired(pendingCase({ expiresAt: '2026-10-17T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('stale detection compares pinned subject revision to live revision', () => {
    const c = pendingCase({ subject: { type: 'FILE', id: 'f1', revision: 'v3' } });
    expect(isProposalStale(c, 'v3')).toBe(false);
    expect(isProposalStale(c, 'v4')).toBe(true);
    expect(isProposalStale(c, null)).toBe(true);
    expect(isProposalStale(pendingCase(), 'anything')).toBe(false); // NONE subject
  });
});

describe('resolveApprovalRequirement (Step 24 seam)', () => {
  const defs = [
    { approvalDefinitionId: 'apdef_b', status: 'ACTIVE', requestType: null, version: 1 },
    { approvalDefinitionId: 'apdef_a', status: 'ACTIVE', requestType: null, version: 2 },
    { approvalDefinitionId: 'apdef_off', status: 'ARCHIVED', requestType: null, version: 1 },
  ];

  it('AUTO_EXECUTE when no ACTIVE definition matches', () => {
    const r = resolveApprovalRequirement({ requestType: 'TRUSTED_COMMAND', definitions: [{ approvalDefinitionId: 'x', status: 'ARCHIVED' }] });
    expect(r.outcome).toBe('AUTO_EXECUTE');
    expect(r.definitionId).toBeNull();
  });

  it('APPROVAL_REQUIRED selects deterministically (lexical tiebreak)', () => {
    const r = resolveApprovalRequirement({ requestType: 'TRUSTED_COMMAND', definitions: defs });
    expect(r.outcome).toBe('APPROVAL_REQUIRED');
    expect(r.definitionId).toBe('apdef_a');
    expect(r.definitionVersion).toBe(2);
  });

  it('requestType-scoped definitions only match their scope', () => {
    const scoped = [{ approvalDefinitionId: 'apdef_s', status: 'ACTIVE', requestType: 'AGENT_PROPOSAL', version: 1 }];
    expect(resolveApprovalRequirement({ requestType: 'TRUSTED_COMMAND', definitions: scoped }).outcome).toBe('AUTO_EXECUTE');
    expect(resolveApprovalRequirement({ requestType: 'AGENT_PROPOSAL', definitions: scoped }).outcome).toBe('APPROVAL_REQUIRED');
  });
});
