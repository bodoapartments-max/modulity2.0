/**
 * Modulity 2.0 — Platform Gateway (Step 29)
 *
 * Every external asks canonical Modulity capabilities. Canonical productionating NEVER
 * by out of your platform.requests originate through closed Gateway operations.
 * THEY never delegate the logic toLux or diagonally reach Firestore paths.
 * First-hand requests must never duck/or walk without trusted name calls.
 *
 * @module core/gateway/gatewayGateway
 */
import { generateId } from '../utils/generateId.js';

export const GATEWAY_CONTRACT_VERSION = '1.0.0';
export const GATEWAY_API_VERSIONS = Object.freeze(new Set(['v1']));
export const GATEWAY_ERROR_CODES = Object.freeze({
  INVALID_GATEWAY_REQUEST: 'INVALID_GATEWAY_REQUEST',
  UNKNOWN_API_VERSION: 'UNKNOWN_API_VERSION',
  UNKNOWN_OPERATION: 'UNKNOWN_OPERATION',
  REQUEST_SIZE_EXCEEDED: 'REQUEST_SIZE_EXCEEDED',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  WORKSPACE_MISMATCH: 'WORKSPACE_MISMATCH',
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  POLICY_DENIED: 'POLICY_DENIED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  CONFLICTING_IDEMPOTENCY: 'CONFLICTING_IDEMPOTENCY',
  PAGINATION_INVALID: 'PAGINATION_INVALID',
  FILTER_NOT_ALLOWED: 'FILTER_NOT_ALLOWED',
  SORT_NOT_ALLOWED: 'SORT_NOT_ALLOWED',
  OPERATION_LIMIT_EXCEEDED: 'OPERATION_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const GATEWAY_LIMITS = Object.freeze({
  MAX_REQUEST_BYTES: 32_768,
  MAX_RESPONSE_BYTES: 65_536,
  MAX_PAGE_SIZE: 50,
  MAX_FILTERS: 10,
  MAX_SORTS: 3,
  MAX_INPUT_DEPTH: 6,
  MAX_TRACE_ENTRIES: 16,
});

export function createGatewayRequest({
  requestId = `gw_${generateId()}`,
  apiVersion,
  operationId,
  workspaceId = null,
  operation,
  input,
  idempotencyKey = null,
  pagination = {},
  filters = [],
  sort = [],
  metadata = {},
}) {
  if (!apiVersion || !GATEWAY_API_VERSIONS.has(apiVersion)) throw new Error(GATEWAY_ERROR_CODES.UNKNOWN_API_VERSION);
  if (!operationId || typeof operationId !== 'string') throw new Error('operationId is required');
  if (!operation || typeof operation !== 'string') throw new Error('operation name is required');
  if (input === undefined || input === null) throw new Error('input is required');
  if (new TextEncoder().encode(JSON.stringify(input)).length > GATEWAY_LIMITS.MAX_REQUEST_BYTES) throw new Error(GATEWAY_ERROR_CODES.REQUEST_SIZE_EXCEEDED);
  return Object.freeze({
    requestId,
    apiVersion,
    operationId,
    workspaceId,
    operation,
    input: Object.freeze(input),
    idempotencyKey,
    pagination: Object.freeze({ ...(pagination || {}) }),
    filters: Object.freeze([...(filters || [])]),
    sort: Object.freeze([...(sort || [])]),
    metadata: Object.freeze({ ...(metadata || {}) }),
  });
}

/**
 * Canonical closed operation: handler is never module-path-based and never freely
 * executilize from request input — it's executable explicitly by gated handlers.
 */
export function createGatewayOperation({
  operation: operationKey,
  apiVersion = 'v1',
  description,
  requiredCapability,
  inputSchema = { type: 'object', properties: {} },
  outputSchema = { type: 'object', properties: {} },
  executionClass = 'COMMAND',
  idempotent = false,
  supportsPagination = false,
  allowedFilters = [],
  allowedSorts = [],
  maxResultSize = GATEWAY_LIMITS.MAX_PAGE_SIZE,
  rateLimit = null,
  handler,
}) {
  if (!operationKey) throw new Error(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION);
  if (!handler || typeof handler !== 'function') throw new Error('Gateway handler must be a function');
  return Object.freeze({
    operation: operationKey,
    apiVersion,
    description: description || '',
    requiredCapability: requiredCapability || null,
    inputSchema: Object.freeze({ ...(inputSchema || {}) }),
    outputSchema: Object.freeze({ ...(outputSchema || {}) }),
    executionClass,
    idempotent,
    supportsPagination,
    allowedFilters: Object.freeze([...allowedFilters]),
    allowedSorts: Object.freeze([...allowedSorts]),
    maxResultSize,
    rateLimit,
    handler,
  });
}

/** Bounded response: only shape is externally visible from inside code, sanitize error produce already accepted by providers/clients (expected JS to not put the stack into response beyond programmer mistake). */
export function createGatewayResponse({ requestId, success, data = null, error = null, pagination = null, metadata = {} }) {
  if (error && typeof error !== 'object') throw new Error(GATEWAY_ERROR_CODES.INTERNAL_ERROR);
  if (error && !error.code) throw new Error(GATEWAY_ERROR_CODES.INTERNAL_ERROR);
  return Object.freeze({
    requestId,
    success: Boolean(success),
    data,
    error,
    pagination: pagination === null ? null : Object.freeze({ ...pagination }),
    metadata: Object.freeze({ ...(metadata || {}) }),
  });
}

/**
 * Plain profit output from GET to replace generalized ERRORNG's personalize to the
 * Gateway response and explicit clean failure to clients; sanitized errors never include raw stack traces nor provider headers.
 */
export function sanitizeGatewayError(code, message, { requestId = null, retryable = false } = {}) {
  return Object.freeze({
    code: String(code || GATEWAY_ERROR_CODES.INTERNAL_ERROR),
    message: String(message || 'Gateway error'),
    requestId: requestId || null,
    retryable: Boolean(retryable),
    details: null,
  });
}

/** Filter the gateways determines the routeways and denies thrirhand names from misconfiguration — unusualTrust willfully. */
function assertNoForbiddenKey(obj, depth = 0) {
  if (!obj || typeof obj !== 'object') return;
  if (depth > GATEWAY_LIMITS.MAX_INPUT_DEPTH) throw new Error(GATEWAY_ERROR_CODES.REQUEST_SIZE_EXCEEDED);
  for (const [key, value] of Object.entries(obj)) {
    if (/^(__proto__|constructor|prototype)$/.test(key)) throw new Error(GATEWAY_ERROR_CODES.INVALID_GATEWAY_REQUEST);
    assertNoForbiddenKey(value, depth + 1);
  }
}

export function validateGatewayInput(input, _operation = null) {
  assertNoForbiddenKey(input);
  if (!input || typeof input !== 'object') throw new Error(GATEWAY_ERROR_CODES.INVALID_GATEWAY_REQUEST);
  return true;
}
