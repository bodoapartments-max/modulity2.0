/**
 * Modulity 2.0 — Approval Action Policy (pure, Step 31)
 *
 * Deterministic policy gate for Approval operations. The trusted server
 * evaluates this authoritatively at command time — and RE-evaluates at
 * decision time, so an approver whose membership/grant expired between
 * assignment and decision retains no authority.
 *
 * UI may use it only to decide which affordances to show — never as
 * authorization.
 *
 * @module core/approvals/approvalActionPolicy
 */

import {
  APPROVAL_STATUSES,
  isTerminalApprovalStatus,
  isPendingAssignee,
} from './approvalCase.js';
import { SELF_APPROVAL_POLICIES } from './approvalConstraints.js';
import { APPROVAL_COMMAND_TYPES, APPROVAL_COMMAND_ERROR_CODES } from './approvalCommandContract.js';

function deny(reasonCode) {
  return { allowed: false, reasonCode };
}
const allow = { allowed: true, reasonCode: null };

/**
 * @param {Object} params
 * @param {Object} params.actorContext — { authenticated, workspaceAccess }
 * @param {string} params.action — APPROVAL_COMMAND_TYPES value
 * @param {Object} [params.actor] — { actorId } for decide/cancel checks
 * @param {Object|null} [params.approvalCase]
 * @param {string|null} [params.now] — ISO time for expiry evaluation
 * @returns {{ allowed: boolean, reasonCode: null|string }}
 */
export function evaluateApprovalAction({ actorContext, action, actor = null, approvalCase = null, now = null }) {
  if (!actorContext?.authenticated) {
    return deny(APPROVAL_COMMAND_ERROR_CODES.UNAUTHENTICATED);
  }
  if (!actorContext.workspaceAccess) {
    return deny(APPROVAL_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN);
  }

  switch (action) {
    case APPROVAL_COMMAND_TYPES.CREATE_APPROVAL_DEFINITION:
    case APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION:
    case APPROVAL_COMMAND_TYPES.CREATE_APPROVAL:
      return allow;

    case APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL: {
      if (!approvalCase) return deny(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND);
      if (approvalCase.status === APPROVAL_STATUSES.PENDING && approvalCase.expiresAt && now && Date.parse(approvalCase.expiresAt) <= Date.parse(now)) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_EXPIRED);
      }
      if (isTerminalApprovalStatus(approvalCase.status)) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.INVALID_APPROVAL_STATE);
      }
      if (!actor?.actorId || !isPendingAssignee(approvalCase, actor.actorId)) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.NOT_ASSIGNED_APPROVER);
      }
      // Self-approval is governed at decision time too: a case created under
      // FORBID cannot be decided by its own requester even if they appear
      // among the assignees.
      if (actor.actorId === approvalCase.requestedBy?.actorId
        && approvalCase.selfApprovalPolicy === SELF_APPROVAL_POLICIES.FORBID) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.SELF_APPROVAL_DENIED);
      }
      return allow;
    }

    case APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL: {
      if (!approvalCase) return deny(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND);
      if (isTerminalApprovalStatus(approvalCase.status)) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.INVALID_APPROVAL_STATE);
      }
      const requester = approvalCase.requestedBy?.actorId;
      const isRequester = actor?.actorId && actor.actorId === requester;
      const isWorkspaceOwner = actorContext.workspaceAccess === 'PERSONAL_OWNER';
      if (!isRequester && !isWorkspaceOwner) {
        return deny(APPROVAL_COMMAND_ERROR_CODES.CANCELLATION_FORBIDDEN);
      }
      return allow;
    }

    default:
      return deny(APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  }
}

/**
 * Validates proposed approvers for case creation (pure part).
 * The caller verifies workspace membership separately; this enforces
 * deterministic rules: approver ids are well-formed and self-approval is
 * explicitly governed by the definition / inline spec.
 *
 * @returns {{ ok: boolean, reasonCode: null|string }}
 */
export function validateApproverAssignments({ stepSpecs, requesterUserId, selfApprovalPolicy }) {
  const policy = selfApprovalPolicy || SELF_APPROVAL_POLICIES.FORBID;
  for (const step of stepSpecs) {
    for (const approverId of step.approverUserIds) {
      if (approverId === requesterUserId && policy === SELF_APPROVAL_POLICIES.FORBID) {
        return { ok: false, reasonCode: APPROVAL_COMMAND_ERROR_CODES.SELF_APPROVAL_DENIED };
      }
    }
  }
  return { ok: true, reasonCode: null };
}

/**
 * Decision-time expiry evaluation — deterministic, wall-clock independent:
 * the caller passes `now`. A pending case whose expiresAt passed is EXPIRED
 * and must not be decided.
 */
export function isApprovalExpired(approvalCase, now) {
  return approvalCase?.status === APPROVAL_STATUSES.PENDING
    && !!approvalCase.expiresAt
    && Date.parse(approvalCase.expiresAt) <= Date.parse(now);
}

/**
 * Stale-state protection: compare the subject revision captured at case
 * creation with the live subject revision. Any material change → stale.
 */
export function isProposalStale(approvalCase, liveSubjectRevision) {
  if (!approvalCase?.subject || approvalCase.subject.type === 'NONE') return false;
  return approvalCase.subject.revision !== liveSubjectRevision;
}

/**
 * Pure policy seam for Step 24 integration: given a proposed action and the
 * workspace's active definitions, decide whether approval is required.
 * AUTO_EXECUTE when no matching definition requires approval; DENY is a
 * Step 24 decision made upstream — never invented here.
 *
 * @returns {{ outcome: 'AUTO_EXECUTE'|'APPROVAL_REQUIRED', definitionId: string|null, definitionVersion: number|null }}
 */
export function resolveApprovalRequirement({ requestType, definitions = [] }) {
  const match = (definitions || [])
    .filter((d) => d.status === 'ACTIVE' && (!d.requestType || d.requestType === requestType))
    .sort((a, b) => a.approvalDefinitionId.localeCompare(b.approvalDefinitionId))[0];
  if (!match) return { outcome: 'AUTO_EXECUTE', definitionId: null, definitionVersion: null };
  return { outcome: 'APPROVAL_REQUIRED', definitionId: match.approvalDefinitionId, definitionVersion: match.version };
}
