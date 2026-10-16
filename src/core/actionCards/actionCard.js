/**
 * Modulity 2.0 — ActionCard projection (Step 31)
 *
 * An Action Card is the user-facing representation of something requiring
 * attention/action. It is a PRESENTATION/OPERATIONAL projection — a derived
 * read-model written by trusted command engines — never canonical truth:
 *
 *   Approval Engine (capability) → ActionCard (projection)
 *
 * Cards are deliberately NOT approval-specific: the type registry reserves
 * TASK / DOCUMENT_MISSING / SCHEDULING_CONFLICT / AGENT_PROPOSAL for future
 * capabilities (Step 42 builds the full Action Inbox UX).
 *
 * `actions[]` is a CLOSED registry of canonical operation descriptors —
 * never executable code, URLs, or arbitrary mutation instructions.
 *
 * @module core/actionCards/actionCard
 */

export const ACTION_CARD_CONTRACT_VERSION = '1.0.0';
export const ACTION_CARD_ID_PREFIX = 'ac_';

export const ACTION_CARD_TYPES = Object.freeze({
  APPROVAL: 'APPROVAL',
  // Reserved (not produced yet): TASK, DOCUMENT_MISSING,
  // SCHEDULING_CONFLICT, COMPLIANCE, AGENT_PROPOSAL, RECONCILIATION_ISSUE.
});

export const ACTION_CARD_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

export const ACTION_CARD_PRIORITIES = Object.freeze({
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
});

/**
 * Closed action registry. Each entry maps to a canonical trusted operation —
 * UI renders buttons from these; the trusted executor enforces them.
 * APPROVAL_DECIDE carries { decision: 'APPROVE'|'REJECT' } + approvalCaseId
 * → DECIDE_APPROVAL command. VIEW_SUBJECT is navigation-only.
 */
export const ACTION_CARD_ACTION_TYPES = Object.freeze({
  APPROVAL_DECIDE: 'APPROVAL_DECIDE',
  VIEW_SUBJECT: 'VIEW_SUBJECT',
});

export function actionCardIdForApproval(approvalCaseId, stepIndex, userId) {
  return `${ACTION_CARD_ID_PREFIX}${approvalCaseId}_s${stepIndex}_${userId}`;
}

/**
 * @param {Object} params
 */
export function createActionCard({
  actionCardId,
  workspaceId,
  type,
  title,
  summary = null,
  subject = null,
  audienceUserIds,
  actions,
  sourceReference,
  priority = ACTION_CARD_PRIORITIES.NORMAL,
  dueAt = null,
  now,
}) {
  if (!actionCardId) throw new Error('actionCardId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Object.values(ACTION_CARD_TYPES).includes(type)) throw new Error(`Unknown card type: ${type}`);
  if (!title) throw new Error('title is required');
  if (!Array.isArray(audienceUserIds) || audienceUserIds.length === 0) {
    throw new Error('audienceUserIds is required');
  }
  if (!Array.isArray(actions)) throw new Error('actions is required');
  for (const action of actions) {
    if (!Object.values(ACTION_CARD_ACTION_TYPES).includes(action.type)) {
      throw new Error(`Unknown card action type: ${action.type}`);
    }
  }
  if (!sourceReference?.type || !sourceReference?.id) throw new Error('sourceReference is required');
  if (!now) throw new Error('now is required');
  return Object.freeze({
    actionCardId,
    contractVersion: ACTION_CARD_CONTRACT_VERSION,
    workspaceId,
    type,
    title,
    summary,
    subject: subject ? Object.freeze({ ...subject }) : null,
    status: ACTION_CARD_STATUSES.OPEN,
    priority,
    audienceUserIds: Object.freeze([...audienceUserIds]),
    actions: Object.freeze(actions.map((a) => Object.freeze({ ...a }))),
    sourceReference: Object.freeze({ ...sourceReference }),
    dueAt,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
  });
}

/**
 * Builds the OPEN approval card for one assignee of a case's current step.
 */
export function buildApprovalActionCard({ approvalCase, approverUserId, stepIndex, summary = null, now }) {
  return createActionCard({
    actionCardId: actionCardIdForApproval(approvalCase.approvalCaseId, stepIndex, approverUserId),
    workspaceId: approvalCase.workspaceId,
    type: ACTION_CARD_TYPES.APPROVAL,
    title: approvalCase.title,
    summary: summary || approvalCase.reason || null,
    subject: approvalCase.subject?.type && approvalCase.subject.type !== 'NONE' ? approvalCase.subject : null,
    audienceUserIds: [approverUserId],
    actions: [
      { type: ACTION_CARD_ACTION_TYPES.APPROVAL_DECIDE, approvalCaseId: approvalCase.approvalCaseId, decision: 'APPROVE' },
      { type: ACTION_CARD_ACTION_TYPES.APPROVAL_DECIDE, approvalCaseId: approvalCase.approvalCaseId, decision: 'REJECT' },
      { type: ACTION_CARD_ACTION_TYPES.VIEW_SUBJECT, subject: approvalCase.subject?.type && approvalCase.subject.type !== 'NONE' ? approvalCase.subject : null },
    ],
    sourceReference: { type: 'APPROVAL_CASE', id: approvalCase.approvalCaseId },
    priority: ACTION_CARD_PRIORITIES.HIGH,
    dueAt: approvalCase.expiresAt || null,
    now,
  });
}

/** Patch applied when the underlying case resolves or advances a step. */
export function buildActionCardClosePatch({ now }) {
  return { status: ACTION_CARD_STATUSES.CLOSED, closedAt: now, updatedAt: now };
}
