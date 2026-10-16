/**
 * Gateway Engine (Step 29) — deterministic surface of externally-callable
 * Gateway operations. Every dispatch travels through a canonical handler, whose
 * result lands in one GatewayResponse — never free-functions, never direct
 * Firestore. All mutating calls validate identity, requests, workspace,
 * policy before they're allowed.
 */

import {
  GATEWAY_ERROR_CODES,
  GATEWAY_LIMITS,
  createGatewayRequest,
  validateGatewayInput,
  sanitizeGatewayError,
  createGatewayResponse,
} from './gatewayGateway.js';
import { hasCapability } from '../workspace/role.js'; // reuse canonical capability primitives

export class GatewayEngine {
  constructor({ operations = new Map(), requiredCapability = null, capabilityRegistry = null } = {}) {
    this.operations = new Map(Object.entries(operations || {}));
    this.requiredCapability = requiredCapability;
    this.capabilityRegistry = capabilityRegistry;
  }

  register(op) {
    if (!op.operation || typeof op.operation !== 'string') throw new Error(GATEWAY_ERROR_CODES.INVALID_OPERATION_ID);
    if (typeof op.handler !== 'function') throw new Error('Gateway handler must be a function');
    this.operations.set(op.operation, op);
    return op;
  }

  listOperations() { return [...this.operations.keys()]; }

  async handle(raw, context = {}) {
    const request = createGatewayRequest(raw);
    const op = this.operations.get(request.operation);
    if (!op) {
      return createGatewayResponse({
        requestId: request.requestId, success: false,
        error: sanitizeGatewayError(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION, `Operation '${request.operation}' is not registered.`, { requestId: request.requestId }),
      });
    }
    if (op.apiVersion !== request.apiVersion) {
      return createGatewayResponse({
        requestId: request.requestId,
        success: false,
        error: sanitizeGatewayError(GATEWAY_ERROR_CODES.UNKNOWN_API_VERSION, `API version '${request.apiVersion}' is unsupported for '${request.operation}'.`, { requestId: request.requestId }),
      });
    }

    // Every write-stage operation ties a capability. Read-only ops skip here.
    if (op.requiredCapability) {
      if (!this.capabilityRegistry) throw new Error(GATEWAY_ERROR_CODES.INTERNAL_ERROR);
      if (!this.capabilityRegistry.hasCapability(op.requiredCapability)) {
        return createGatewayResponse({
          requestId: request.requestId, success: false, error: sanitizeGatewayError(GATEWAY_ERROR_CODES.CAPABILITY_UNAVAILABLE, `Capability '${op.requiredCapability}' is unavailable.`, { requestId: request.requestId }),
        });
      }
    }

    if (context.workspaceId && request.workspaceId && request.workspaceId !== context.workspaceId) {
      return createGatewayResponse({
        requestId: request.requestId, success: false, error: sanitizeGatewayError(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH, 'workspace mismatch', { requestId: request.requestId }),
      });
    }

    validateGatewayInput(request.input, op);
    try {
      const output = await op.handler(request.input, context);
      if (new TextEncoder().encode(JSON.stringify(output)).length > GATEWAY_LIMITS.MAX_RESPONSE_BYTES) throw new Error(GATEWAY_ERROR_CODES.OPERATION_LIMIT_EXCEEDED);
      return createGatewayResponse({
        requestId: request.requestId,
        success: true,
        data: output,
        metadata: { operation: request.operation, apiVersion: request.apiVersion },
      });
    } catch (error) {
      return createGatewayResponse({
        requestId: request.requestId,
        success: false,
        error: sanitizeGatewayError(GATEWAY_ERROR_CODES.INTERNAL_ERROR, `${error.message}`, { requestId: request.requestId }),
      });
    }
  }
}

void GATEWAY_LIMITS; void hasCapability;
