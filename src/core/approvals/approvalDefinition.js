/**
 * Modulity 2.0 — ApprovalDefinition (Step 31)
 *
 * Reusable approval configuration separated from individual ApprovalCases.
 *
 *   ApprovalDefinition ──(pinned snapshot)──▶ ApprovalCase.steps
 *
 * A case stores its own step snapshots plus {definitionId, version} as
 * provenance: editing a definition NEVER rewrites an already-open case.
 * Definitions are versioned — each UPDATE produces version N+1 and preserves
 * the prior version snapshot for auditability.
 *
 * @module core/approvals/approvalDefinition
 */

import { APPROVAL_QUORUM_POLICIES, SELF_APPROVAL_POLICIES, APPROVAL_LIMITS } from './approvalConstraints.js';

export const APPROVAL_DEFINITION_CONTRACT_VERSION = '1.0.0';

export const APPROVAL_DEFINITION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
});

/**
 * @param {Object} params
 * @param {Array} params.steps — [{ name?, quorum, approverUserIds[] }]
 */
export function createApprovalDefinition({
  approvalDefinitionId,
  workspaceId,
  name,
  description = null,
  requestType = null, // optional scoping: definition applies to one requestType
  steps,
  selfApprovalPolicy = SELF_APPROVAL_POLICIES.FORBID,
  defaultExpiresInMs = null,
  version = 1,
  status = APPROVAL_DEFINITION_STATUSES.ACTIVE,
  createdBy,
  now,
}) {
  if (!approvalDefinitionId) throw new Error('approvalDefinitionId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!name) throw new Error('name is required');
  if (!createdBy?.actorId) throw new Error('createdBy is required');
  if (!now) throw new Error('now is required');
  const normalizedSteps = validateDefinitionSteps(steps);
  if (!SELF_APPROVAL_POLICIES[selfApprovalPolicy]) {
    throw new Error(`Unknown selfApprovalPolicy: ${selfApprovalPolicy}`);
  }
  return Object.freeze({
    approvalDefinitionId,
    contractVersion: APPROVAL_DEFINITION_CONTRACT_VERSION,
    workspaceId,
    name,
    description,
    requestType,
    steps: Object.freeze(normalizedSteps),
    selfApprovalPolicy,
    defaultExpiresInMs: defaultExpiresInMs ?? null,
    version,
    status,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: now,
    updatedAt: now,
  });
}

export function validateDefinitionSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > APPROVAL_LIMITS.MAX_STEPS) {
    throw new Error(`steps must contain 1..${APPROVAL_LIMITS.MAX_STEPS} entries`);
  }
  return steps.map((step, i) => {
    if (!APPROVAL_QUORUM_POLICIES[step.quorum]) {
      throw new Error(`Unknown quorum policy at step ${i}: ${step.quorum}`);
    }
    const ids = step.approverUserIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > APPROVAL_LIMITS.MAX_APPROVERS_PER_STEP) {
      throw new Error(`step ${i} must list 1..${APPROVAL_LIMITS.MAX_APPROVERS_PER_STEP} approvers`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error(`step ${i} contains duplicate approvers`);
    }
    if (step.name && step.name.length > APPROVAL_LIMITS.MAX_STEP_NAME_LENGTH) {
      throw new Error(`step ${i} name exceeds limit`);
    }
    return Object.freeze({ name: step.name || null, quorum: step.quorum, approverUserIds: Object.freeze([...ids]) });
  });
}
