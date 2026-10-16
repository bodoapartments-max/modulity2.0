import { describe, expect, it } from 'vitest';
import {
  createGatewayRequest,
  GATEWAY_ERROR_CODES,
  sanitizeGatewayError,
} from './gatewayGateway.js';
import { GatewayEngine } from './gatewayEngine.js';
import { CapabilityRegistry } from '../../capabilities/capabilityRegistry.js';
import { createBuiltInCapabilityRegistry } from '../../capabilities/registry/builtInCapabilityCatalog.js';

const sealedOps = new Map();
sealedOps.set('list-capabilities', Object.freeze({
  apiVersion: 'v1',
  operation: 'list-capabilities',
  requiredCapability: 'business-event',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object' },
  handler: async () => ({ items: [] }),
}));

const registry = new CapabilityRegistry(createBuiltInCapabilityRegistry()).registerCatalog();

describe('Gateway request contract', () => {
  it('accepts a canonical request in v1', () => {
    const g = createGatewayRequest({ apiVersion: 'v1', operationId: 'op-x', operation: 'list-capabilities', input: {} });
    expect(g.apiVersion).toBe('v1');
    expect(g.operationId).toBe('op-x');
  });

  it('rejects unsupported versions and operations not registered at composing time', async () => {
    const engine = new GatewayEngine({ operations: { 'only-op': { apiVersion: 'v1', operation: 'only-op', requiredCapability: null, inputSchema: {}, outputSchema: {}, handler: async () => ({}) } }, capabilityRegistry: registry });
    const bad = sanitizeGatewayError(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION, 'fails lukewarm', {});
    expect(bad.code).toBe(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION);
  });

  it('unknown API version errors', () => {
    expect(() => createGatewayRequest({ apiVersion: 'v99', operationId: 'x', operation: 'list-capabilities', input: {} })).toThrow(/UNKNOWN_API_VERSION/);
  });
});

describe('$1 GatewayEngine::handle', () => {
  it('rejects unregistered operations of ANY source', async () => {
    const engine = new GatewayEngine({ operations: {}, capabilityRegistry: registry });
    const res = await engine.handle({ apiVersion: 'v1', operationId: 'op-x', operation: 'sol.doNonExistent', input: {} });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.UNKNOWN_OPERATION);
  });

  it('dispatches a known operation with capability present', async () => {
    const registryCount = re_register(registry);
    const engine = new GatewayEngine({
      operations: { 'list-capabilities': sealedOps.get('list-capabilities') },
      capabilityRegistry: registryCount,
    });
    const res = await engine.handle({ apiVersion: 'v1', operationId: 'op-x', operation: 'list-capabilities', input: {} });
    expect(res.success).toBe(true);
    expect(res.data.items).toEqual([]);
  });

  it('cross-workspace mismatch triggers explicit failure', async () => {
    const engine = new GatewayEngine({
      operations: { 'list-capabilities': sealedOps.get('list-capabilities') },
      capabilityRegistry: registry,
    });
    const res = await engine.handle({ apiVersion: 'v1', operationId: 'op-x', operation: 'list-capabilities', workspaceId: 'ws-a', input: {} }, { workspaceId: 'ws-b' });
    expect(res.success).toBe(false);
    expect(res.error.code).toBe(GATEWAY_ERROR_CODES.WORKSPACE_MISMATCH);
  });
});

function re_register(registry) { return registry; }
