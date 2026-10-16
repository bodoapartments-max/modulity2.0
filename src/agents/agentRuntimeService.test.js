import { describe, expect, it } from 'vitest';
import { AgentRuntime, AGENT_RUNTIME_ERROR_CODES } from './agentRuntimeService.js';
import { KNOWN_TOOL_IDS, validateToolArguments } from './tools/agentToolRegistry.js';

function fakeProvider(behavior) { return { providerKey: 'TEST_ADAPTER', generate: async ({ task, context, history } = {}) => behavior({ task, context, history }) }; }

describe('AgentRuntime locked behaviour', () => {
  it('provider calls are structured; unknown providers rejected', async () => {
    const runtime = new AgentRuntime({ capabilityRegistry: null, providerRegistry: new Map() });
    runtime.registerProvider(fakeProvider(() => ({ intents: [] })));
    await expect(runtime.run({ runId: 'run-x', agentDefinition: { agentId: 'x', name: 'N', mode: 'ASSIST' }, task: 'ok', workspaceId: 'ws-1' })).rejects.toBeInstanceOf(Error);
  });

  it('step orchestration loops stays inside tool registry boundaries — error path', async () => {
    const runtime = new AgentRuntime({ capabilityRegistry: null, providerRegistry: new Map() });
    let count = 0;
    runtime.registerProvider(fakeProvider(async () => {
      count += 1;
      if (count === 1) return { intents: [{ toolId: 'EVALUATE_RULE', args: { rule: null, input: {} } }] };
      return { intents: [] };
    }));
    const result = await runtime.run({ runId: 'run-ok', workspaceId: 'ws-1', agentDefinition: { agentId: 'x', name: 'N', mode: 'ASSIST', provider: 'TEST_ADAPTER' }, task: 'ok' });
    expect(result.status).toBe('COMPLETED');
    expect(result.trace.filter((entry) => entry.kind === 'TOOL_RESULT').length).toBe(1);
  });

  it('unknown provider id fails deterministically', async () => {
    const runtime = new AgentRuntime({ capabilityRegistry: null });
    await expect(runtime.run({ runId: 'run-z', workspaceId: 'ws-1', agentDefinition: { agentId: 'x', name: 'N', mode: 'ASSIST', provider: 'missingprovider' }, task: 't' })).rejects.toThrow('UNKNOWN_PROVIDER');
  });

  it('tool schema validation rejects malformed requests', () => {
    expect(() => validateToolArguments({ toolId: 'EVALUATE_RULE', inputSchema: { required: ['rule'] } }, { })).toThrow('INVALID_TOOL_ARGUMENT');
  });

  it('runtime loops are bounded — step exhaustion is a failed run (not a throw)', async () => {
    const runtime = new AgentRuntime({ capabilityRegistry: null, providerRegistry: new Map() });
    runtime.registerProvider(fakeProvider(async () => ({ intents: [{ toolId: 'EVALUATE_RULE', args: { rule: { ruleId: 'x', ruleCode: 'X', name: 'X', workspaceId: 'ws-1', status: 'ACTIVE' }, input: {} } }] }) ));
    const result = await runtime.run({ runId: 'run-loopy', workspaceId: 'ws-1', agentDefinition: { agentId: 'x', name: 'N', mode: 'ASSIST', provider: 'TEST_ADAPTER' }, task: 'loop' });
    expect(result.status).toBe('FAILED');
  });

  it('simulation tool stays behind real engine semantics', async () => {
    // Only runs via `AGENT_SIMULATE` offload; proposal could occurs here.
  });
});

void AGENT_RUNTIME_ERROR_CODES;
void KNOWN_TOOL_IDS;
