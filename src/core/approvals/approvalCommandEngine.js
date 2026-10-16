/**
 * Modulity 2.0 — Pure Approval Command Builders (Step 31)
 *
 * Deterministic document builders and transition evaluators shared by the
 * trusted approvalCommand executor and unit tests. No I/O here — the caller
 * supplies resolved inputs (workspace, definition, subject revision,
 * approver validation result) and applies the returned patches inside its
 * transaction.
 *
 * @module core/approvals/approvalCommandEngine
 */

import {
  createApprovalCase,
  createApprovalStep,
  createApprovalDecision,
  APPROVAL_STATUSES,
  APPROVAL_DECISIONS,
  EXECUTION_STATUSES,
} from './approvalCase.js';
import { createApprovalDefinition, APPROVAL_DEFINITION_STATUSES } from './approvalDefinition.js';
import {
  approvalCaseIdFor,
  approvalDefinitionIdFor,
  decisionIdFor,
  APPROVAL_STEP_STATUSES,
  APPROVAL_QUORUM_POLICIES,
  SELF_APPROVAL_POLICIES,
} from './approvalConstraints.js';
import { APPROVAL_COMMAND_TYPES } from './approvalCommandContract.js';

/**
 * Snapshots definition steps (or validates inline steps) into the pinned
 * step shape stored on the case.
 */
export function snapshotSteps(stepSpecs) {
  return stepSpecs.map((spec, i) => createApprovalStep({
    stepIndex: i,
    name: spec.name || null,
    quorum: spec.quorum,
    approverUserIds: spec.approverUserIds,
  }));
}

/**
 * Builds the ApprovalCase document for CREATE_APPROVAL.
 * The caller supplies the already-validated inputs:
 *  - `steps` — snapshot from definition or validated inline steps
 *  - `subjectRevision` — captured from the live subject doc (or null)
 *  - `proposalFingerprint` — sha256 over canonicalProposalMaterial
 *  - `definitionRef` — {definitionId, version} provenance pin (or null)
 */
export function buildApprovalCaseFromCommand({ command, actorId, steps, subjectRevision = null, proposalFingerprint, definitionRef = null, selfApprovalPolicy = SELF_APPROVAL_POLICIES.FORBID, expiresAt = null, now }) {
  const p = command.payload;
  const subject = p.subject
    ? { type: p.subject.type, id: p.subject.id, revision: subjectRevision }
    : null;
  return createApprovalCase({
    approvalCaseId: approvalCaseIdFor(command.operationId),
    workspaceId: p.workspaceId,
    requestType: p.requestType,
    title: p.title,
    subject,
    proposedAction: p.proposedAction,
    proposalFingerprint,
    requestedBy: { actorType: 'USER', actorId },
    steps,
    definitionRef,
    selfApprovalPolicy,
    expiresAt,
    reason: p.reason || null,
    correlationId: command.operationId,
    now,
  });
}

/** Builds the initial ApprovalDefinition document (version 1). */
export function buildApprovalDefinitionFromCommand({ command, actorId, now }) {
  const p = command.payload;
  return createApprovalDefinition({
    approvalDefinitionId: approvalDefinitionIdFor(command.operationId),
    workspaceId: p.workspaceId,
    name: p.name,
    description: p.description || null,
    requestType: p.requestType || null,
    steps: p.steps,
    selfApprovalPolicy: p.selfApprovalPolicy || SELF_APPROVAL_POLICIES.FORBID,
    defaultExpiresInMs: p.defaultExpiresInMs ?? null,
    createdBy: { actorType: 'USER', actorId },
    now,
  });
}

/**
 * Computes the next definition revision for UPDATE_APPROVAL_DEFINITION.
 * A structural change (steps / selfApprovalPolicy / defaultExpiresInMs)
 * bumps `version`; cosmetic changes keep it. Returns the update patch.
 */
export function buildDefinitionUpdatePatch({ command, definition, now }) {
  const p = command.payload;
  const patch = { updatedAt: now };
  if (p.name !== undefined) patch.name = p.name;
  if (p.description !== undefined) patch.description = p.description;
  if (p.status !== undefined) {
    if (p.status !== APPROVAL_DEFINITION_STATUSES.ARCHIVED && p.status !== APPROVAL_DEFINITION_STATUSES.ACTIVE) {
      throw new Error('UNSUPPORTED_STATUS');
    }
    patch.status = p.status;
  }
  const structural =
    (p.steps !== undefined && JSON.stringify(p.steps) !== JSON.stringify(definition.steps)) ||
    (p.selfApprovalPolicy !== undefined && p.selfApprovalPolicy !== definition.selfApprovalPolicy) ||
    (p.defaultExpiresInMs !== undefined && p.defaultExpiresInMs !== definition.defaultExpiresInMs);
  if (p.steps !== undefined) patch.steps = p.steps.map((s) => ({ name: s.name || null, quorum: s.quorum, approverUserIds: [...s.approverUserIds] }));
  if (p.selfApprovalPolicy !== undefined) patch.selfApprovalPolicy = p.selfApprovalPolicy;
  if (p.defaultExpiresInMs !== undefined) patch.defaultExpiresInMs = p.defaultExpiresInMs;
  if (structural) patch.version = (definition.version || 1) + 1;
  return patch;
}

/**
 * Applies a decision to a pending case (pure transition).
 *
 * Returns { decision, patch, stepOutcome, caseOutcome } where:
 *  - stepOutcome: 'PENDING' | 'COMPLETED' | 'REJECTED'
 *  - caseOutcome: 'PENDING' | 'ADVANCED' | 'APPROVED' | 'REJECTED'
 *
 * Deterministic concurrent semantics: ANY_ONE resolves the step on the
 * first decision; ALL keeps the step PENDING until every assignee has
 * approved — any REJECT resolves the case REJECTED immediately.
 */
export function applyDecisionToCase({ approvalCase, decision, operationId, actorId, now }) {
  const stepIndex = approvalCase.currentStepIndex;

  const dec = createApprovalDecision({
    decisionId: decisionIdFor(operationId),
    stepIndex,
    decidedBy: { actorType: 'USER', actorId },
    decision,
    decidedAt: now,
  });

  const decisions = [...approvalCase.decisions, dec];
  const steps = approvalCase.steps.map((s) => ({ ...s, assignments: s.assignments.map((a) => ({ ...a })) }));
  const current = steps[stepIndex];
  const assignment = current.assignments.find((a) => a.approverUserId === actorId);
  assignment.status = decision === APPROVAL_DECISIONS.APPROVE ? APPROVAL_STEP_STATUSES.APPROVED : APPROVAL_STEP_STATUSES.REJECTED;
  assignment.decisionId = dec.decisionId;

  if (decision === APPROVAL_DECISIONS.REJECT) {
    current.status = APPROVAL_STEP_STATUSES.REJECTED;
    return {
      decision: dec,
      patch: { decisions, steps, status: APPROVAL_STATUSES.REJECTED, resolvedAt: now, updatedAt: now },
      stepOutcome: 'REJECTED',
      caseOutcome: APPROVAL_STATUSES.REJECTED,
    };
  }

  // APPROVE
  let stepCompleted = false;
  if (current.quorum === APPROVAL_QUORUM_POLICIES.ANY_ONE) {
    stepCompleted = true;
    current.assignments.forEach((a) => {
      if (a.status === APPROVAL_STEP_STATUSES.PENDING) a.status = APPROVAL_STEP_STATUSES.SKIPPED;
    });
  } else { // ALL
    stepCompleted = current.assignments.every((a) => a.status === APPROVAL_STEP_STATUSES.APPROVED);
  }

  if (!stepCompleted) {
    return {
      decision: dec,
      patch: { decisions, steps, updatedAt: now },
      stepOutcome: 'PENDING',
      caseOutcome: 'PENDING',
    };
  }

  current.status = APPROVAL_STEP_STATUSES.APPROVED;
  const isLastStep = stepIndex >= steps.length - 1;
  if (isLastStep) {
    return {
      decision: dec,
      patch: { decisions, steps, status: APPROVAL_STATUSES.APPROVED, resolvedAt: now, updatedAt: now },
      stepOutcome: 'COMPLETED',
      caseOutcome: APPROVAL_STATUSES.APPROVED,
    };
  }
  return {
    decision: dec,
    patch: { decisions, steps, currentStepIndex: stepIndex + 1, updatedAt: now },
    stepOutcome: 'COMPLETED',
    caseOutcome: 'ADVANCED',
  };
}

/** Builds the patch for CANCEL_APPROVAL on a pending case. */
export function buildCancellationPatch({ now }) {
  return { status: APPROVAL_STATUSES.CANCELLED, resolvedAt: now, updatedAt: now };
}

/** Builds the patch marking lazy expiry detected at decision time. */
export function buildExpiryPatch({ now }) {
  return { status: APPROVAL_STATUSES.EXPIRED, resolvedAt: now, updatedAt: now };
}

/** Marks the embedded trusted action as executed (post-execution marker). */
export function buildExecutionMarkerPatch({ resourcePath = null, now }) {
  return {
    'execution.status': EXECUTION_STATUSES.EXECUTED,
    'execution.executedAt': now,
    'execution.resultResourcePath': resourcePath,
    updatedAt: now,
  };
}

export { APPROVAL_COMMAND_TYPES };
