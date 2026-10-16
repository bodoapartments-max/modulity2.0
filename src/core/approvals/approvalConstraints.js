/**
 * Modulity 2.0 — Approval Constraints (Step 31)
 *
 * Closed registries, bounds and deterministic derivations for the generic
 * Approval capability. Shared by browser validation, the trusted
 * approvalCommand executor and the Action Card projection.
 *
 * SECURITY BOUNDARY:
 *  - Subject references are a CLOSED typed registry — never arbitrary
 *    Firestore paths.
 *  - Proposed actions are a CLOSED action registry — never executable code,
 *    function names, URLs or raw mutations.
 *  - The proposal fingerprint binds an ApprovalCase to the exact material
 *    that was reviewed; the server recomputes it at decision time.
 *
 * @module core/approvals/approvalConstraints
 */

export const APPROVAL_LIMITS = Object.freeze({
  MAX_STEPS: 8,
  MAX_APPROVERS_PER_STEP: 8,
  MAX_STEP_NAME_LENGTH: 80,
  MAX_CASE_TITLE_LENGTH: 120,
  MAX_REASON_LENGTH: 512,
  MAX_PROPOSED_ACTION_BYTES: 16 * 1024,
  MAX_METADATA_BYTES: 8 * 1024,
});

export const APPROVAL_ID_PREFIX = 'appr_';
export const APPROVAL_DEFINITION_ID_PREFIX = 'apdef_';
export const DECISION_ID_PREFIX = 'dec_';
export const EXECUTION_OPERATION_PREFIX = 'exec_';

/**
 * Request/proposal kinds. Closed — new kinds are an architecture decision.
 * TRUSTED_COMMAND wraps an existing trusted command envelope.
 * AGENT_PROPOSAL is reserved for the Agent Runtime seam (Step 27+):
 * an agent proposal must still flow through this same engine and gains no
 * authority by originating it.
 */
export const APPROVAL_REQUEST_TYPES = Object.freeze({
  TRUSTED_COMMAND: 'TRUSTED_COMMAND',
  AGENT_PROPOSAL: 'AGENT_PROPOSAL', // reserved — not active until the agent seam lands
});

export const ACTIVE_APPROVAL_REQUEST_TYPES = Object.freeze([
  APPROVAL_REQUEST_TYPES.TRUSTED_COMMAND,
]);

/**
 * Closed action registry: what the approved outcome may resume.
 * RECORD_COMMAND re-enters the trusted recordCommand boundary — approval
 * authorizes, the canonical command executes.
 */
export const PROPOSED_ACTION_TYPES = Object.freeze({
  RECORD_COMMAND: 'RECORD_COMMAND',
});

/**
 * Closed subject reference registry. Approvals may point at typed canonical
 * objects only — never raw paths. FILE subjects pin an exact version through
 * `subject.revision` captured at case creation (approval of v3 never implies
 * v4).
 */
export const APPROVAL_SUBJECT_TYPES = Object.freeze({
  RECORD: 'RECORD',
  ENTITY: 'ENTITY',
  FILE: 'FILE',
  NONE: 'NONE',
});

export const APPROVAL_STEP_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SKIPPED: 'SKIPPED',
});

export const APPROVAL_QUORUM_POLICIES = Object.freeze({
  ANY_ONE: 'ANY_ONE', // first decision resolves the step
  ALL: 'ALL',         // every assignee must approve
  // QUORUM(n) is a documented extension seam — not implemented.
});

export const SELF_APPROVAL_POLICIES = Object.freeze({
  FORBID: 'FORBID', // requester may never decide their own case (default)
  ALLOW: 'ALLOW',   // requester may be an approver (explicit definition opt-in)
});

export const APPROVAL_CASE_ID_PATTERN = /^appr_[A-Za-z0-9_-]{1,120}$/;
export const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function approvalCaseIdFor(operationId) {
  return `${APPROVAL_ID_PREFIX}${operationId}`;
}

export function approvalDefinitionIdFor(operationId) {
  return `${APPROVAL_DEFINITION_ID_PREFIX}${operationId}`;
}

export function decisionIdFor(operationId) {
  return `${DECISION_ID_PREFIX}${operationId}`;
}

/** Deterministic operationId for the embedded trusted action execution. */
export function executionOperationIdFor(approvalOperationId) {
  return `${EXECUTION_OPERATION_PREFIX}${approvalOperationId}`;
}

export function isValidApprovalCaseId(id) {
  return typeof id === 'string' && APPROVAL_CASE_ID_PATTERN.test(id);
}

export function isSafeId(id) {
  return typeof id === 'string' && SAFE_ID_PATTERN.test(id);
}

export function isValidIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

export function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Canonical material over which the proposal fingerprint is computed.
 * Server-side hashing (sha256 over stableJson) happens in the trusted
 * executor; this function defines exactly WHAT is fingerprinted:
 * the request type, the subject identity + captured revision, and the full
 * proposed action payload. Any material mutation of the subject changes
 * `subject.revision` at decision time → the approval cannot authorize a
 * stale action.
 */
export function canonicalProposalMaterial({ requestType, subject, proposedAction }) {
  return {
    requestType,
    subject: subject
      ? { type: subject.type, id: subject.id, revision: subject.revision ?? null }
      : { type: APPROVAL_SUBJECT_TYPES.NONE, id: null, revision: null },
    proposedAction,
  };
}

/**
 * Closed subject doc-path resolution — mirrors attachmentTargetDocPath.
 * Returns the Firestore path for subject existence/revision checks, or null.
 */
export function approvalSubjectDocPath(subjectType, workspaceId, subjectId) {
  switch (subjectType) {
    case APPROVAL_SUBJECT_TYPES.RECORD:
      return `workspaces/${workspaceId}/records/${subjectId}`;
    case APPROVAL_SUBJECT_TYPES.ENTITY:
      return `workspaces/${workspaceId}/entities/${subjectId}`;
    case APPROVAL_SUBJECT_TYPES.FILE:
      return `workspaces/${workspaceId}/files/${subjectId}`;
    default:
      return null;
  }
}

/**
 * The revision token captured on a subject at case-creation and re-verified
 * at decision/execution time. For FILE subjects the pinned approval covers
 * `currentVersion`; RECORD/ENTITY use `updatedAt`. Any material change bumps
 * the revision and invalidates reuse of the approval.
 */
export function subjectRevisionOf(subjectType, subjectDoc) {
  if (!subjectDoc) return null;
  if (subjectType === APPROVAL_SUBJECT_TYPES.FILE) {
    return `v${subjectDoc.currentVersion ?? 0}`;
  }
  const updated = subjectDoc._updatedAt?.toDate?.()?.toISOString?.()
    || subjectDoc.updatedAt
    || null;
  return updated ? `u${updated}` : null;
}
