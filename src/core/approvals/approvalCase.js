/**
 * Modulity 2.0 — ApprovalCase (Step 31)
 *
 * One canonical controlled-decision process around a proposed action.
 *
 *   REQUEST / PROPOSAL → ApprovalCase → ApprovalStep(s)
 *     → assigned decision maker(s) → Decision → AUTHORIZED OUTCOME
 *     → trusted action
 *
 * Approval authorizes; it never executes a business mutation itself. The
 * embedded `proposedAction` re-enters the canonical trusted command boundary
 * when the final step is approved.
 *
 * Immutable evidence lives inside the case document: `steps[]` snapshots are
 * pinned at creation (a later ApprovalDefinition edit cannot rewrite an open
 * case), `decisions[]` is append-only.
 *
 * @module core/approvals/approvalCase
 */

import {
  APPROVAL_REQUEST_TYPES,
  APPROVAL_SUBJECT_TYPES,
  APPROVAL_STEP_STATUSES,
  SELF_APPROVAL_POLICIES,
} from './approvalConstraints.js';

export const APPROVAL_CASE_CONTRACT_VERSION = '1.0.0';

/**
 * Deterministic lifecycle. PENDING is the only non-terminal state;
 * IN_PROGRESS is unnecessary — `currentStepIndex` carries progression.
 * A resolved case never returns to PENDING; reopening would be a new case.
 */
export const APPROVAL_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
});

export const TERMINAL_APPROVAL_STATUSES = Object.freeze([
  APPROVAL_STATUSES.APPROVED,
  APPROVAL_STATUSES.REJECTED,
  APPROVAL_STATUSES.CANCELLED,
  APPROVAL_STATUSES.EXPIRED,
]);

export const APPROVAL_DECISIONS = Object.freeze({
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  // Reserved future decision kinds — REQUEST_CHANGES / RETURN / DELEGATE.
  // Not active: changing a proposal produces a NEW case revision, never a
  // silent approval reuse.
});
export const ACTIVE_APPROVAL_DECISIONS = Object.freeze([
  APPROVAL_DECISIONS.APPROVE,
  APPROVAL_DECISIONS.REJECT,
]);

export const EXECUTION_STATUSES = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED', // case resolved without execution (reject/cancel/expire)
  PENDING_EXECUTION: 'PENDING_EXECUTION', // approved, trusted action not yet confirmed
  EXECUTED: 'EXECUTED',
});

export function isTerminalApprovalStatus(status) {
  return TERMINAL_APPROVAL_STATUSES.includes(status);
}

/**
 * Creates the canonical ApprovalCase document shape.
 * All fields are server-derived — see functions/src/approvalCommandEngine.js.
 *
 * @param {Object} params
 */
export function createApprovalCase({
  approvalCaseId,
  workspaceId,
  requestType,
  title,
  subject,
  proposedAction,
  proposalFingerprint,
  requestedBy,
  steps,
  definitionRef = null,
  selfApprovalPolicy = SELF_APPROVAL_POLICIES.FORBID,
  expiresAt = null,
  reason = null,
  correlationId = null,
  metadata = {},
  now,
}) {
  if (!approvalCaseId) throw new Error('approvalCaseId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Object.values(APPROVAL_REQUEST_TYPES).includes(requestType)) {
    throw new Error(`Unknown requestType: ${requestType}`);
  }
  if (!title) throw new Error('title is required');
  if (!proposedAction?.actionType) throw new Error('proposedAction is required');
  if (!proposalFingerprint) throw new Error('proposalFingerprint is required');
  if (!requestedBy?.actorId) throw new Error('requestedBy is required');
  if (!SELF_APPROVAL_POLICIES[selfApprovalPolicy]) throw new Error(`Unknown selfApprovalPolicy: ${selfApprovalPolicy}`);
  if (!Array.isArray(steps) || steps.length === 0) throw new Error('steps are required');
  if (!now) throw new Error('now is required');
  if (subject && !Object.values(APPROVAL_SUBJECT_TYPES).includes(subject.type)) {
    throw new Error(`Unknown subject type: ${subject.type}`);
  }
  return Object.freeze({
    approvalCaseId,
    contractVersion: APPROVAL_CASE_CONTRACT_VERSION,
    workspaceId,
    requestType,
    title,
    subject: subject ? Object.freeze({ ...subject }) : { type: APPROVAL_SUBJECT_TYPES.NONE, id: null, revision: null },
    proposedAction: Object.freeze({ ...proposedAction }),
    proposalFingerprint,
    requestedBy: Object.freeze({ ...requestedBy }),
    status: APPROVAL_STATUSES.PENDING,
    currentStepIndex: 0,
    steps: Object.freeze(steps.map((s) => Object.freeze({ ...s }))),
    decisions: Object.freeze([]),
    definitionRef: definitionRef ? Object.freeze({ ...definitionRef }) : null,
    selfApprovalPolicy,
    execution: Object.freeze({ status: EXECUTION_STATUSES.PENDING_EXECUTION, executedAt: null, resultResourcePath: null }),
    expiresAt,
    reason,
    correlationId,
    metadata: Object.freeze({ ...metadata }),
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  });
}

/**
 * Canonical step snapshot — pinned into the case at creation time so a later
 * ApprovalDefinition edit can never rewrite an open case.
 *
 * @param {Object} params
 */
export function createApprovalStep({
  stepIndex,
  name = null,
  quorum,
  approverUserIds,
}) {
  if (!Number.isInteger(stepIndex) || stepIndex < 0) throw new Error('stepIndex is required');
  if (!quorum) throw new Error('quorum is required');
  if (!Array.isArray(approverUserIds) || approverUserIds.length === 0) {
    throw new Error('approverUserIds is required');
  }
  return Object.freeze({
    stepIndex,
    name,
    quorum,
    status: APPROVAL_STEP_STATUSES.PENDING,
    // One assignment per approver; decision status tracked per assignee so
    // ALL-quorum concurrency stays deterministic.
    assignments: Object.freeze(approverUserIds.map((userId) => Object.freeze({
      approverUserId: userId,
      status: APPROVAL_STEP_STATUSES.PENDING,
      decisionId: null,
    }))),
  });
}

/**
 * Immutable decision evidence. `decidedAt` is server time; `decidedBy` is the
 * authenticated actor — the client can forge neither.
 */
export function createApprovalDecision({ decisionId, stepIndex, decidedBy, decision, reason = null, decidedAt }) {
  if (!decisionId) throw new Error('decisionId is required');
  if (!Number.isInteger(stepIndex)) throw new Error('stepIndex is required');
  if (!decidedBy?.actorId) throw new Error('decidedBy is required');
  if (!decision) throw new Error('decision is required');
  if (!decidedAt) throw new Error('decidedAt is required');
  return Object.freeze({
    decisionId,
    stepIndex,
    decidedBy: Object.freeze({ ...decidedBy }),
    decision,
    reason,
    decidedAt,
  });
}

/** The step currently awaiting decisions, or null for a resolved case. */
export function currentStepOf(approvalCase) {
  if (!approvalCase || isTerminalApprovalStatus(approvalCase.status)) return null;
  return approvalCase.steps?.[approvalCase.currentStepIndex] || null;
}

/** True when the actor holds a PENDING assignment on the current step. */
export function isPendingAssignee(approvalCase, userId) {
  const step = currentStepOf(approvalCase);
  if (!step) return false;
  return step.assignments.some((a) => a.approverUserId === userId && a.status === APPROVAL_STEP_STATUSES.PENDING);
}

/** Approver ids for the current step — drives Action Card audience. */
export function currentApproverIds(approvalCase) {
  const step = currentStepOf(approvalCase);
  if (!step) return [];
  return step.assignments.map((a) => a.approverUserId);
}
