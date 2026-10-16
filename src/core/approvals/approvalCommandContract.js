/**
 * Modulity 2.0 — Trusted Approval Command Contract (Step 31)
 *
 * Versioned, server-authoritative command envelope for the generic Approval
 * capability.
 *
 * Implemented commands:
 *   CREATE_APPROVAL_DEFINITION — register a versioned approval configuration
 *   UPDATE_APPROVAL_DEFINITION — produce definition version N+1 / archive
 *   CREATE_APPROVAL            — open an ApprovalCase for a proposed action
 *   DECIDE_APPROVAL            — record an APPROVE/REJECT decision
 *   CANCEL_APPROVAL            — cancel a pending case (evidence preserved)
 *
 * The server derives actor, case/decision/definition ids, status, step
 * progression, proposal fingerprints, execution state and all timestamps.
 * A proposed action is a CLOSED registry entry — it wraps a trusted command
 * envelope without an operationId; the server assigns the deterministic
 * execution operation id.
 *
 * @module core/approvals/approvalCommandContract
 */

import {
  ACTIVE_APPROVAL_REQUEST_TYPES,
  APPROVAL_REQUEST_TYPES,
  APPROVAL_SUBJECT_TYPES,
  PROPOSED_ACTION_TYPES,
  APPROVAL_QUORUM_POLICIES,
  SELF_APPROVAL_POLICIES,
  APPROVAL_LIMITS,
  isValidApprovalCaseId,
  isSafeId,
  isValidIsoTimestamp,
  jsonBytes,
} from './approvalConstraints.js';
import { ACTIVE_APPROVAL_DECISIONS } from './approvalCase.js';
import { APPROVAL_DEFINITION_STATUSES } from './approvalDefinition.js';
import { RECORD_COMMAND_TYPES } from '../recordCommands/recordCommandContract.js';

export const APPROVAL_COMMAND_CONTRACT_VERSION = '1.0.0';
export const SUPPORTED_APPROVAL_CONTRACT_VERSIONS = Object.freeze(['1.0.0']);

export const APPROVAL_COMMAND_TYPES = Object.freeze({
  CREATE_APPROVAL_DEFINITION: 'CREATE_APPROVAL_DEFINITION',
  UPDATE_APPROVAL_DEFINITION: 'UPDATE_APPROVAL_DEFINITION',
  CREATE_APPROVAL: 'CREATE_APPROVAL',
  DECIDE_APPROVAL: 'DECIDE_APPROVAL',
  CANCEL_APPROVAL: 'CANCEL_APPROVAL',
});

export const APPROVAL_COMMAND_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  APPROVAL_NOT_FOUND: 'APPROVAL_NOT_FOUND',
  DEFINITION_NOT_FOUND: 'DEFINITION_NOT_FOUND',
  SUBJECT_NOT_FOUND: 'SUBJECT_NOT_FOUND',
  INVALID_APPROVAL_STATE: 'INVALID_APPROVAL_STATE',
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED',
  PROPOSAL_STALE: 'PROPOSAL_STALE',
  NOT_ASSIGNED_APPROVER: 'NOT_ASSIGNED_APPROVER',
  APPROVER_NOT_AUTHORIZED: 'APPROVER_NOT_AUTHORIZED',
  SELF_APPROVAL_DENIED: 'SELF_APPROVAL_DENIED',
  CANCELLATION_FORBIDDEN: 'CANCELLATION_FORBIDDEN',
  UNSUPPORTED_TARGET: 'UNSUPPORTED_TARGET',
  UNSUPPORTED_ACTION: 'UNSUPPORTED_ACTION',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  UNSUPPORTED_CONTRACT_VERSION: 'UNSUPPORTED_CONTRACT_VERSION',
  UNSUPPORTED_COMMAND: 'UNSUPPORTED_COMMAND',
  OPERATION_INVALID: 'OPERATION_INVALID',
  OPERATION_CONFLICT: 'OPERATION_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  OPERATION_MISMATCH: 'OPERATION_MISMATCH',
  OPERATION_FAILED: 'OPERATION_FAILED',
});

const MAX_OPERATION_ID_LENGTH = 128;

/** Server-authoritative fields — presence in a payload is a forgery attempt. */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'actor', 'actorId', 'userId',
  'requestedBy', 'decidedBy', 'decidedAt',
  'status', 'currentStepIndex', 'decisions', 'assignments',
  'proposalFingerprint', 'execution', 'resolvedAt',
  'approvalCaseId', // never client-chosen on CREATE (decide/cancel carry it explicitly)
  'version', 'createdAt', 'updatedAt',
]);

const FORBIDDEN_ACTION_KEYS = Object.freeze(['operationId', 'actor', 'actorId', 'userId', 'workspaceId']);

/**
 * Validates an approval command envelope.
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateApprovalCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    return { valid: false, errors: ['Command must be an object'], code: APPROVAL_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }
  if (!SUPPORTED_APPROVAL_CONTRACT_VERSIONS.includes(command.contractVersion)) {
    return { valid: false, errors: [`Unsupported contractVersion: ${command.contractVersion}`], code: APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION };
  }
  if (!Object.values(APPROVAL_COMMAND_TYPES).includes(command.commandType)) {
    return { valid: false, errors: [`Unsupported commandType: ${command.commandType}`], code: APPROVAL_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  if (!command.operationId || typeof command.operationId !== 'string' || command.operationId.length > MAX_OPERATION_ID_LENGTH) {
    errors.push('operationId is required (string, <=128 chars)');
  }
  const payload = command.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['payload is required'], code: APPROVAL_COMMAND_ERROR_CODES.OPERATION_INVALID };
  }
  if (!payload.workspaceId || typeof payload.workspaceId !== 'string') {
    errors.push('payload.workspaceId is required');
  }
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload && !(key === 'approvalCaseId' && (command.commandType === APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL || command.commandType === APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL))) {
      errors.push(`payload.${key} is server-authoritative and must not be supplied`);
    }
  }
  if (jsonBytes(payload) > 64 * 1024) errors.push('payload exceeds 64 KiB');

  switch (command.commandType) {
    case APPROVAL_COMMAND_TYPES.CREATE_APPROVAL_DEFINITION:
    case APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION:
      validateDefinitionPayload(payload, errors, command.commandType === APPROVAL_COMMAND_TYPES.UPDATE_APPROVAL_DEFINITION);
      break;
    case APPROVAL_COMMAND_TYPES.CREATE_APPROVAL:
      validateCreatePayload(payload, errors);
      break;
    case APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL:
      validateDecisionPayload(payload, errors);
      break;
    case APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL:
      validateCancelPayload(payload, errors);
      break;
    default:
      break;
  }
  return { valid: errors.length === 0, errors };
}

function validateDefinitionPayload(payload, errors, isUpdate) {
  if (isUpdate && !isSafeId(payload.approvalDefinitionId)) {
    errors.push('approvalDefinitionId is required for UPDATE');
  }
  if (!isUpdate && !payload.name) errors.push('name is required');
  if (payload.name !== undefined && (typeof payload.name !== 'string' || payload.name.length > APPROVAL_LIMITS.MAX_CASE_TITLE_LENGTH)) {
    errors.push('name must be a bounded string');
  }
  if (payload.requestType !== undefined && payload.requestType !== null && !Object.values(APPROVAL_REQUEST_TYPES).includes(payload.requestType)) {
    errors.push(`Unknown requestType: ${payload.requestType}`);
  }
  if (payload.selfApprovalPolicy !== undefined && !SELF_APPROVAL_POLICIES[payload.selfApprovalPolicy]) {
    errors.push(`Unknown selfApprovalPolicy: ${payload.selfApprovalPolicy}`);
  }
  if (payload.defaultExpiresInMs !== undefined && payload.defaultExpiresInMs !== null
    && (!Number.isFinite(payload.defaultExpiresInMs) || payload.defaultExpiresInMs <= 0)) {
    errors.push('defaultExpiresInMs must be a positive number');
  }
  if (payload.status !== undefined && !Object.values(APPROVAL_DEFINITION_STATUSES).includes(payload.status)) {
    errors.push(`Unknown definition status: ${payload.status}`);
  }
  if (payload.steps !== undefined) validateStepShapes(payload.steps, errors);
  else if (!isUpdate) errors.push('steps are required');
}

function validateStepShapes(steps, errors) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > APPROVAL_LIMITS.MAX_STEPS) {
    errors.push(`steps must contain 1..${APPROVAL_LIMITS.MAX_STEPS} entries`);
    return;
  }
  steps.forEach((step, i) => {
    if (!step || typeof step !== 'object') { errors.push(`step ${i} must be an object`); return; }
    if (!APPROVAL_QUORUM_POLICIES[step.quorum]) errors.push(`step ${i} quorum must be ANY_ONE or ALL`);
    const ids = step.approverUserIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > APPROVAL_LIMITS.MAX_APPROVERS_PER_STEP || !ids.every(isSafeId)) {
      errors.push(`step ${i} must list 1..${APPROVAL_LIMITS.MAX_APPROVERS_PER_STEP} valid approver ids`);
    }
  });
}

function validateCreatePayload(payload, errors) {
  if (!ACTIVE_APPROVAL_REQUEST_TYPES.includes(payload.requestType)) {
    errors.push(`requestType must be one of: ${ACTIVE_APPROVAL_REQUEST_TYPES.join(', ')}`);
  }
  if (!payload.title || typeof payload.title !== 'string' || payload.title.length > APPROVAL_LIMITS.MAX_CASE_TITLE_LENGTH) {
    errors.push('title is required (bounded string)');
  }
  if (payload.subject !== undefined && payload.subject !== null) {
    const s = payload.subject;
    if (!Object.values(APPROVAL_SUBJECT_TYPES).includes(s.type) || s.type === APPROVAL_SUBJECT_TYPES.NONE) {
      errors.push(`subject.type must be one of: ${Object.values(APPROVAL_SUBJECT_TYPES).filter((t) => t !== 'NONE').join(', ')}`);
    }
    if (!isSafeId(s.id)) errors.push('subject.id is required');
  }
  validateProposedAction(payload.proposedAction, errors);
  const hasDefinition = isSafeId(payload.definitionId);
  const hasInline = Array.isArray(payload.steps);
  if (hasDefinition && hasInline) errors.push('Provide either definitionId or inline steps, not both');
  if (!hasDefinition && !hasInline) errors.push('definitionId or inline steps are required');
  if (hasInline) validateStepShapes(payload.steps, errors);
  if (payload.selfApprovalPolicy !== undefined && !SELF_APPROVAL_POLICIES[payload.selfApprovalPolicy]) {
    errors.push(`Unknown selfApprovalPolicy: ${payload.selfApprovalPolicy}`);
  }
  if (payload.expiresAt !== undefined && payload.expiresAt !== null && !isValidIsoTimestamp(payload.expiresAt)) {
    errors.push('expiresAt must be an ISO timestamp');
  }
  if (payload.reason !== undefined && payload.reason !== null
    && (typeof payload.reason !== 'string' || payload.reason.length > APPROVAL_LIMITS.MAX_REASON_LENGTH)) {
    errors.push('reason exceeds limit');
  }
}

function validateProposedAction(action, errors) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    errors.push('proposedAction is required');
    return;
  }
  if (!Object.values(PROPOSED_ACTION_TYPES).includes(action.actionType)) {
    errors.push(`Unsupported actionType: ${action.actionType}`);
    return;
  }
  for (const key of FORBIDDEN_ACTION_KEYS) {
    if (key in action) errors.push(`proposedAction.${key} is server-authoritative`);
  }
  if (jsonBytes(action) > APPROVAL_LIMITS.MAX_PROPOSED_ACTION_BYTES) {
    errors.push('proposedAction exceeds limit');
    return;
  }
  if (action.actionType === PROPOSED_ACTION_TYPES.RECORD_COMMAND) {
    const cmd = action.command;
    if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) {
      errors.push('proposedAction.command is required');
      return;
    }
    for (const key of FORBIDDEN_ACTION_KEYS) {
      if (key in cmd) errors.push(`proposedAction.command.${key} is server-authoritative`);
    }
    if (!Object.values(RECORD_COMMAND_TYPES).includes(cmd.commandType)) {
      errors.push(`proposedAction.command.commandType is not a record command`);
    }
    if (!cmd.payload || typeof cmd.payload !== 'object' || Array.isArray(cmd.payload)) {
      errors.push('proposedAction.command.payload is required');
    }
  }
}

function validateDecisionPayload(payload, errors) {
  if (!isValidApprovalCaseId(payload.approvalCaseId)) errors.push('approvalCaseId is required');
  if (!ACTIVE_APPROVAL_DECISIONS.includes(payload.decision)) {
    errors.push(`decision must be one of: ${ACTIVE_APPROVAL_DECISIONS.join(', ')}`);
  }
  if (payload.reason !== undefined && payload.reason !== null
    && (typeof payload.reason !== 'string' || payload.reason.length > APPROVAL_LIMITS.MAX_REASON_LENGTH)) {
    errors.push('reason exceeds limit');
  }
}

function validateCancelPayload(payload, errors) {
  if (!isValidApprovalCaseId(payload.approvalCaseId)) errors.push('approvalCaseId is required');
  if (payload.reason !== undefined && payload.reason !== null
    && (typeof payload.reason !== 'string' || payload.reason.length > APPROVAL_LIMITS.MAX_REASON_LENGTH)) {
    errors.push('reason exceeds limit');
  }
}

/** Client-side builders — convenience only; the server re-validates. */
export function buildCreateApprovalCommand({ operationId, workspaceId, requestType, title, subject = null, proposedAction, definitionId = null, steps = null, selfApprovalPolicy = null, expiresAt = null, reason = null }) {
  return {
    contractVersion: APPROVAL_COMMAND_CONTRACT_VERSION,
    commandType: APPROVAL_COMMAND_TYPES.CREATE_APPROVAL,
    operationId,
    payload: {
      workspaceId, requestType, title,
      ...(subject ? { subject } : {}),
      proposedAction,
      ...(definitionId ? { definitionId } : {}),
      ...(steps ? { steps } : {}),
      ...(selfApprovalPolicy ? { selfApprovalPolicy } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

export function buildDecideApprovalCommand({ operationId, workspaceId, approvalCaseId, decision, reason = null }) {
  return {
    contractVersion: APPROVAL_COMMAND_CONTRACT_VERSION,
    commandType: APPROVAL_COMMAND_TYPES.DECIDE_APPROVAL,
    operationId,
    payload: { workspaceId, approvalCaseId, decision, ...(reason ? { reason } : {}) },
  };
}

export function buildCancelApprovalCommand({ operationId, workspaceId, approvalCaseId, reason = null }) {
  return {
    contractVersion: APPROVAL_COMMAND_CONTRACT_VERSION,
    commandType: APPROVAL_COMMAND_TYPES.CANCEL_APPROVAL,
    operationId,
    payload: { workspaceId, approvalCaseId, ...(reason ? { reason } : {}) },
  };
}
