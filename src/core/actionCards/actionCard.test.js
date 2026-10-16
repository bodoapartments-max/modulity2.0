/**
 * ActionCard projection tests (Step 31)
 */
import { describe, it, expect } from 'vitest';
import {
  createActionCard,
  buildApprovalActionCard,
  buildActionCardClosePatch,
  actionCardIdForApproval,
  ACTION_CARD_TYPES,
  ACTION_CARD_STATUSES,
  ACTION_CARD_ACTION_TYPES,
} from './actionCard.js';
import { createApprovalCase } from '../approvals/approvalCase.js';

const NOW = '2026-10-16T12:00:00.000Z';

function baseCard(overrides = {}) {
  return createActionCard({
    actionCardId: 'ac_1', workspaceId: 'ws1',
    type: ACTION_CARD_TYPES.APPROVAL, title: 'Do the thing',
    audienceUserIds: ['u2'],
    actions: [{ type: ACTION_CARD_ACTION_TYPES.VIEW_SUBJECT, subject: null }],
    sourceReference: { type: 'APPROVAL_CASE', id: 'appr_1' },
    now: NOW,
    ...overrides,
  });
}

describe('createActionCard', () => {
  it('builds an OPEN card', () => {
    const c = baseCard();
    expect(c.status).toBe(ACTION_CARD_STATUSES.OPEN);
    expect(c.closedAt).toBeNull();
  });

  it('rejects unknown card types', () => {
    expect(() => baseCard({ type: 'EXPENSE_APPROVAL' })).toThrow(/card type/);
  });

  it('rejects actions outside the closed registry', () => {
    expect(() => baseCard({ actions: [{ type: 'EXECUTE_URL', url: 'https://x' }] })).toThrow(/action type/);
  });

  it('requires a source reference — cards are always derived, never standalone', () => {
    expect(() => baseCard({ sourceReference: null })).toThrow(/sourceReference/);
  });
});

describe('buildApprovalActionCard', () => {
  const approvalCase = createApprovalCase({
    approvalCaseId: 'appr_op1', workspaceId: 'ws1', requestType: 'TRUSTED_COMMAND',
    title: 'Expense approval', proposedAction: { actionType: 'RECORD_COMMAND', command: { commandType: 'SUBMIT_RECORD', payload: {} } },
    proposalFingerprint: 'fp', requestedBy: { actorType: 'USER', actorId: 'u1' },
    steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u2', status: 'PENDING', decisionId: null }] }],
    reason: 'Please review', expiresAt: '2026-10-20T00:00:00.000Z',
    now: NOW,
  });

  it('produces a deterministic per-assignee card id', () => {
    const card = buildApprovalActionCard({ approvalCase, approverUserId: 'u2', stepIndex: 0, now: NOW });
    expect(card.actionCardId).toBe(actionCardIdForApproval('appr_op1', 0, 'u2'));
    expect(card.audienceUserIds).toEqual(['u2']);
    expect(card.dueAt).toBe(approvalCase.expiresAt);
  });

  it('exposes closed APPROVE/REJECT decide actions bound to the case', () => {
    const card = buildApprovalActionCard({ approvalCase, approverUserId: 'u2', stepIndex: 0, now: NOW });
    const decides = card.actions.filter((a) => a.type === ACTION_CARD_ACTION_TYPES.APPROVAL_DECIDE);
    expect(decides.map((d) => d.decision).sort()).toEqual(['APPROVE', 'REJECT']);
    expect(decides.every((d) => d.approvalCaseId === 'appr_op1')).toBe(true);
  });

  it('links back to the canonical approval case — never a second truth', () => {
    const card = buildApprovalActionCard({ approvalCase, approverUserId: 'u2', stepIndex: 0, now: NOW });
    expect(card.sourceReference).toEqual({ type: 'APPROVAL_CASE', id: 'appr_op1' });
  });
});

describe('buildActionCardClosePatch', () => {
  it('closes the card with a timestamp', () => {
    const patch = buildActionCardClosePatch({ now: NOW });
    expect(patch.status).toBe(ACTION_CARD_STATUSES.CLOSED);
    expect(patch.closedAt).toBe(NOW);
  });
});
