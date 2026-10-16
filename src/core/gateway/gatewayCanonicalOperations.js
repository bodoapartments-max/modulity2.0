/**
 * Modulity 2.0 — Canonical Gateway Operations (Step 29 / RC-01)
 *
 * The closed operation registry entries that connect the Platform Gateway to
 * the canonical application layer. Every operation:
 *
 *   GatewayRequest
 *     → closed operation registry (GatewayEngine)
 *     → authentication/context (actor required)
 *     → workspace resolution (context.workspaceId is trusted)
 *     → capability check (engine-level requiredCapability)
 *     → policy authorization (decideAuthorization — Step 24)
 *     → existing canonical service / trusted command
 *     → normalized GatewayResponse (engine-level)
 *
 * ABSOLUTE RULES:
 *   - No Firestore access. Reads go through Record services; writes go through
 *     the trusted Record Command boundary (operation journal idempotency).
 *   - No server-authoritative field may arrive from external input.
 *   - The Gateway decides nothing by itself: it consumes the canonical
 *     Policy/Authority decision surface.
 *
 * @module core/gateway/gatewayCanonicalOperations
 */

import { createGatewayOperation, GATEWAY_ERROR_CODES } from './gatewayGateway.js';
import {
  decideAuthorization,
  POLICY_OUTCOMES,
  POLICY_ACTOR_TYPES,
} from '../permissions/policyAuthority.js';
import { buildCreateRecordCommand } from '../recordCommands/recordCommandContract.js';
import { AppError } from '../errors/appError.js';

/** Inputs the outside world may never set — server-derived only. */
const PROTECTED_INPUT_KEYS = Object.freeze([
  'workspaceId', 'createdBy', 'submittedBy', 'updatedBy', 'actor', 'actorId', 'userId',
  'createdAt', 'updatedAt', 'submittedAt', 'status', 'statusTarget',
  'recordId', 'moduleVersion', 'ledgerEntryId', 'ledgerBookId', 'referenceNumber',
]);

function fail(code, message) {
  const err = new AppError(code, message);
  err.gatewayCode = code;
  throw err;
}

/** A Gateway request must carry an authenticated actor context. */
function requireActor(context) {
  const actor = context?.actor;
  if (!actor || !actor.actorId || !POLICY_ACTOR_TYPES[actor.actorType]) {
    fail(GATEWAY_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authenticated actor context is required.');
  }
  return actor;
}

/** The workspace the caller was resolved into — never the raw request claim. */
function requireWorkspace(context, request) {
  const workspaceId = context?.workspaceId || request?.workspaceId || null;
  if (!workspaceId) fail(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH, 'Workspace context is required.');
  return workspaceId;
}

function assertNoProtectedKeys(input) {
  for (const key of PROTECTED_INPUT_KEYS) {
    if (key in (input || {})) {
      fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, `Input field '${key}' is server-authoritative.`);
    }
  }
}

/**
 * Canonical policy gate for Gateway operations.
 * AUTO_EXECUTE → proceed. APPROVAL_REQUIRED → explicit non-execution.
 * Everything else → denied.
 */
function assertPolicyAllows(decision) {
  if (decision?.outcome === POLICY_OUTCOMES.AUTO_EXECUTE) return decision;
  if (decision?.outcome === POLICY_OUTCOMES.APPROVAL_REQUIRED) {
    fail(GATEWAY_ERROR_CODES.APPROVAL_REQUIRED, 'This operation requires approval before execution.');
  }
  fail(GATEWAY_ERROR_CODES.POLICY_DENIED, 'Policy denied this operation.');
}

/**
 * Maps trusted-command engine errors onto the Gateway error contract. The
 * operation journal is the durable idempotency boundary — its conflict codes
 * must survive the boundary crossing.
 */
function mapCommandError(error) {
  const code = error?.details?.code || error?.code || null;
  if (code === 'OPERATION_MISMATCH' || code === 'OPERATION_CONFLICT') {
    fail(GATEWAY_ERROR_CODES.CONFLICTING_IDEMPOTENCY, 'Conflicting request for an existing idempotency identity.');
  }
  if (code === 'OPERATION_IN_PROGRESS') {
    fail(GATEWAY_ERROR_CODES.CONFLICT, 'The same operation is already being processed.');
  }
  if (code === 'UNAUTHENTICATED') fail(GATEWAY_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  if (code === 'WORKSPACE_FORBIDDEN' || code === 'MODULE_FORBIDDEN' || code === 'ACTION_NOT_ALLOWED') {
    fail(GATEWAY_ERROR_CODES.PERMISSION_DENIED, 'Permission denied by the trusted command boundary.');
  }
  if (code === 'WORKSPACE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || code === 'RECORD_NOT_FOUND') {
    fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, error.message || 'Resource not found.');
  }
  if (code) fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, error.message || 'Command rejected.');
  throw error;
}

function policyInput(actor, workspaceId, resourceType, resourceId, permission, context) {
  return {
    actor,
    grantSnapshot: context?.grants || context?.grantSnapshot || [],
    workspaceId,
    resourceType,
    resourceId,
    permission,
    evaluationTime: context?.evaluationTime ? new Date(context.evaluationTime) : new Date(0),
  };
}

/**
 * Builds the canonical v1 operation set.
 *
 * @param {Object} deps
 * @param {Object} deps.recordService       — canonical Record read service
 * @param {Object} [deps.recordQueryService] — canonical paginated query service
 * @param {Object} deps.recordCommand       — trusted command executor
 *   ({ execute(command) }) — in production this is the callable client bound
 *   to the server-side command engine; its operation journal provides the
 *   durable idempotency boundary.
 * @param {Function} [deps.policyDecider]   — defaults to canonical
 *   decideAuthorization; injectable ONLY for tests of non-AUTO_EXECUTE paths.
 */
export function createCanonicalGatewayOperations({ recordService, recordQueryService = null, recordCommand, policyDecider = decideAuthorization }) {
  const operations = {};

  operations['record.get'] = createGatewayOperation({
    operation: 'record.get',
    apiVersion: 'v1',
    description: 'Read a single canonical Record by id within the caller workspace.',
    requiredCapability: 'platform-gateway',
    executionClass: 'READ',
    inputSchema: { type: 'object', properties: { recordId: { type: 'string' } }, required: ['recordId'] },
    handler: async (input, context) => {
      const actor = requireActor(context);
      const workspaceId = requireWorkspace(context, context?.request);
      if (!input.recordId || typeof input.recordId !== 'string') {
        fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, 'recordId is required.');
      }
      assertPolicyAllows(
        policyDecider(policyInput(actor, workspaceId, 'RECORD', input.recordId, 'record.read', context)),
      );
      const record = await recordService.getRecord(workspaceId, input.recordId);
      if (!record || record.workspaceId !== workspaceId) {
        fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, 'Record not found.');
      }
      return { record };
    },
  });

  operations['record.list'] = createGatewayOperation({
    operation: 'record.list',
    apiVersion: 'v1',
    description: 'List canonical Records in the caller workspace via the canonical query service.',
    requiredCapability: 'platform-gateway',
    executionClass: 'READ',
    supportsPagination: true,
    inputSchema: { type: 'object', properties: { bucket: { type: 'string' }, moduleId: { type: 'string' }, status: { type: 'string' } } },
    handler: async (input, context) => {
      const actor = requireActor(context);
      const workspaceId = requireWorkspace(context, context?.request);
      assertPolicyAllows(
        policyDecider(policyInput(actor, workspaceId, 'RECORD', null, 'record.read', context)),
      );
      if (!recordQueryService) fail(GATEWAY_ERROR_CODES.CAPABILITY_UNAVAILABLE, 'Record query capability is not configured.');
      const result = await recordQueryService.queryRecords({
        workspaceId,
        userId: actor.actorId,
        bucket: input.bucket,
        moduleId: input.moduleId,
        status: input.status,
      });
      return result;
    },
  });

  operations['record.create'] = createGatewayOperation({
    operation: 'record.create',
    apiVersion: 'v1',
    description: 'Create a canonical Record through the trusted Record command boundary.',
    requiredCapability: 'platform-gateway',
    executionClass: 'COMMAND',
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'string' },
        values: { type: 'object' },
        isDraft: { type: 'boolean' },
      },
      required: ['moduleId', 'values'],
    },
    handler: async (input, context) => {
      const actor = requireActor(context);
      const workspaceId = requireWorkspace(context, context?.request);
      assertNoProtectedKeys(input);
      if (!input.moduleId || typeof input.moduleId !== 'string') {
        fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, 'moduleId is required.');
      }
      if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) {
        fail(GATEWAY_ERROR_CODES.VALIDATION_FAILED, 'values must be an object.');
      }
      assertPolicyAllows(
        policyDecider(policyInput(actor, workspaceId, 'RECORD', null, 'record.create', context)),
      );
      const request = context?.request;
      const operationId = request?.idempotencyKey || request?.operationId;
      if (!operationId) fail(GATEWAY_ERROR_CODES.INVALID_GATEWAY_REQUEST, 'operationId or idempotencyKey is required for mutations.');
      const command = buildCreateRecordCommand({
        operationId,
        workspaceId,
        moduleId: input.moduleId,
        values: input.values,
        isDraft: input.isDraft === true,
      });
      let result;
      try {
        result = await recordCommand.execute(command);
      } catch (error) {
        mapCommandError(error);
      }
      return { recordId: result?.record?.recordId || null, operationId, idempotent: result?.idempotent === true };
    },
  });

  return Object.freeze(operations);
}
