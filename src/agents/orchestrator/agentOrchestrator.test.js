import { describe, expect, it } from 'vitest';
import { AGENT_PROVIDER_TYPES, AGENT_STATUSES, createAgentDefinition, createAgentExecutionRequest } from '../contracts/agentContracts.js';
import { AgentRegistry } from '../registry/agentRegistry.js';
import { DeterministicTestAdapter } from '../providers/deterministicTestAdapter.js';
import { AgentOrchestrator } from './agentOrchestrator.js';

const definition = (overrides = {}) => ({ agentId: 'agent:organization-analyzer', agentCode: 'ORGANIZATION_ANALYZER', name: 'Organization Analyzer', description: 'Contract-only analyzer', version: '1.0.0', capability: 'automat.organization_analysis', inputSchemaVersion: '1.0.0', outputSchemaVersion: '1.0.0', status: AGENT_STATUSES.ACTIVE, providerAdapter: AGENT_PROVIDER_TYPES.DETERMINISTIC_TEST, timeoutPolicy: { timeoutMs: 50 }, metadata: {}, ...overrides });
const request = (overrides = {}) => ({ requestId: 'request-1', workspaceId: 'workspace-1', agentCode: 'ORGANIZATION_ANALYZER', agentVersion: '1.0.0', inputSchemaVersion: '1.0.0', outputSchemaVersion: '1.0.0', requestedBy: 'user-1', input: { description: 'A hotel' }, context: {}, ...overrides });

function setup(output, options = {}) {
  const registry = new AgentRegistry(options);
  registry.register(definition(options.definition));
  const adapter = new DeterministicTestAdapter({ ORGANIZATION_ANALYZER: output });
  return new AgentOrchestrator({ registry, adapters: { DETERMINISTIC_TEST: adapter }, inputValidators: options.inputValidators || { 'ORGANIZATION_ANALYZER@1.0.0': () => true }, outputValidators: options.outputValidators || { 'ORGANIZATION_ANALYZER@1.0.0': () => true }, clock: () => '2026-10-02T12:00:00.000Z' });
}

describe('Agent infrastructure', () => {
  it('enforces strict serializable definitions and requests', () => {
    expect(createAgentDefinition(definition()).agentCode).toBe('ORGANIZATION_ANALYZER');
    expect(() => createAgentDefinition({ ...definition(), secret: 'no' })).toThrow('unknown properties');
    expect(() => createAgentExecutionRequest({ ...request(), arbitraryCode: 'eval()' })).toThrow('unknown properties');
    expect(() => createAgentExecutionRequest(request({ input: { value: 'x'.repeat(70_000) } }))).toThrow('size limit');
  });

  it('registers versioned agents and rejects duplicates, unknown versions, and denied entitlements', async () => {
    const registry = new AgentRegistry({ canUse: async () => false });
    registry.register(definition());
    expect(() => registry.register(definition())).toThrow('already registered');
    await expect(registry.resolve('UNKNOWN', '1.0.0')).rejects.toThrow('Unknown agent');
    await expect(registry.resolve('ORGANIZATION_ANALYZER', '2.0.0')).rejects.toThrow('Unknown agent');
    await expect(registry.resolve('ORGANIZATION_ANALYZER', '1.0.0')).rejects.toThrow('not entitled');
  });

  it('executes through the deterministic adapter and preserves provenance', async () => {
    const result = await setup({ profile: 'hotel' }).execute(request());
    expect(result.status).toBe('SUCCEEDED');
    expect(result.output).toEqual({ profile: 'hotel' });
    expect(result.provenance).toMatchObject({ requestedBy: 'user-1', providerAdapter: 'DETERMINISTIC_TEST', agentId: 'agent:organization-analyzer' });
  });

  it('rejects contract version mismatch or missing deterministic validators before provider execution', async () => {
    await expect(setup({}).execute(request({ outputSchemaVersion: '2.0.0' }))).rejects.toThrow('contract version mismatch');
    await expect(setup({}, { inputValidators: {}, outputValidators: {} }).execute(request())).rejects.toThrow('Contract validator unavailable');
  });

  it('normalizes malformed output and provider failures', async () => {
    const malformed = await setup(['not-an-object']).execute(request());
    expect(malformed.status).toBe('FAILED');
    const failed = await setup(() => { throw Object.assign(new Error('provider failed'), { code: 'PROVIDER_FAILED' }); }).execute(request());
    expect(failed).toMatchObject({ status: 'FAILED', errors: [{ code: 'PROVIDER_FAILED', message: 'provider failed' }] });
  });

  it('normalizes timeout without mutating platform state', async () => {
    const result = await setup(() => new Promise(() => {}), { definition: { timeoutPolicy: { timeoutMs: 5 } } }).execute(request());
    expect(result.status).toBe('TIMED_OUT');
    expect(result.output).toBeNull();
  });
});
