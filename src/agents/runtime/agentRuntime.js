/**
 * Modulity 2.0 — Agent Runtime Contracts (Step 27)
 *
 * Terminals:
 *   AgentDefinition  — WHAT an agent is (mode, provider identity, allowed tools, limits)
 *   AgentRun      — ONE bounded execution cycle (task → trace → result)
 *
 * Key contract:
 *   MODE ensures a flight type (BUILD / CHANGE / ASSIST).
 *   ProviderAdapters translate between a neutral platform and a live provider
 *   so nothing else knows vendor flavor.
 */
export const AGENT_RUNTIME_CONTRACT_VERSION = '1.0.0';

export const AGENT_MODES = Object.freeze({ BUILD: 'BUILD', CHANGE: 'CHANGE', ASSIST: 'ASSIST' });

export const AGENT_RUN_STATUSES = Object.freeze({
  CREATED: 'CREATED',
  PREPARING_CONTEXT: 'PREPARING_CONTEXT',
  CALLING_PROVIDER: 'CALLING_PROVIDER',
  TOOL_REQUIRED: 'TOOL_REQUIRED',
  TOOL_EXECUTED: 'TOOL_EXECUTED',
  SIMULATING: 'SIMULATING',
  PROPOSING_CONFIGURATION: 'PROPOSING_CONFIGURATION',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

export const AGENT_RUNTIME_ERROR_CODES = Object.freeze({
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  PROVIDER_RESPONSE_INVALID: 'PROVIDER_RESPONSE_INVALID',
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  INVALID_TOOL_ARGS: 'INVALID_TOOL_ARGS',
  UNKNOWN_MODE: 'UNKNOWN_MODE',
  CONTEXT_LIMIT_EXCEEDED: 'CONTEXT_LIMIT_EXCEEDED',
  CONTEXT_ACCESS_DENIED: 'CONTEXT_ACCESS_DENIED',
  AGENT_STEP_LIMIT_EXCEEDED: 'AGENT_STEP_LIMIT_EXCEEDED',
  AGENT_TOOL_LIMIT_EXCEEDED: 'AGENT_TOOL_LIMIT_EXCEEDED',
  AGENT_LOOP_DETECTED: 'AGENT_LOOP_DETECTED',
  AGENT_CANCELLED: 'AGENT_CANCELLED',
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
});

export const AGENT_RUNTIME_LIMITS = Object.freeze({
  MAX_AGENT_STEPS: 12,
  MAX_TOOL_CALLS_PER_STEP: 3,
  MAX_TOOL_CALLS_PER_RUN: 24,
  MAX_TOOL_RESULT_BYTES: 8_192,
  MAX_TRACE_ENTRIES: 64,
  MAX_CONTEXT_RECORDS: 50,
  MAX_CONTEXT_ITEMS: 100,
  MAX_CONTEXT_BYTES: 24_000,
});

export function createAgentDefinition({
  agentId, version = '1', name, mode, provider: providerKey = null, model = null, allowedToolIds = [], allowedCapabilityIds = [], description = '', timeoutMs = 10_000, contextKeys = [], contextBytes = AGENT_RUNTIME_LIMITS.MAX_CONTEXT_BYTES,
}) {
  if (!agentId || typeof agentId !== 'string') throw new Error('agentId is required');
  if (!name?.trim()) throw new Error('name is required');
  if (!AGENT_MODES[mode]) throw new Error(`UNSUPPORTED AGENT MODE: ${mode}`);
  if (!providerKey) throw new Error('provider is required');
  if (!allowedToolIds.every((id) => /^[A-Z][A-Z0-9_]+$/.test(id))) throw new Error('allowedToolIds must be uppercase snake-case');
  return Object.freeze({
    agentId, version: String(version), name: name.trim(), mode, provider: providerKey, model, allowedToolIds: Object.freeze([...allowedToolIds]), allowedCapabilityIds: Object.freeze([...allowedCapabilityIds]), description, timeoutMs, contextKeys: Object.freeze([...contextKeys]), contextBytes,
  });
}

export function createAgentRun({
  runId, workspaceId, agentId, agentVersion, mode, task, status = AGENT_RUN_STATUSES.CREATED, byActor = null, context = {}, startedAt = null, providerMetadata = {},
}) {
  if (!runId) throw new Error('runId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!agentId) throw new Error('agentId is required');
  if (!Object.values(AGENT_RUN_STATUSES).includes(status)) throw new Error('Invalid AgentRun status');
  return Object.freeze({
    runId, workspaceId, agentId, agentVersion, mode, task, status, byActor,
    context: Object.freeze({ ...context }), startedAt: startedAt || new Date().toISOString(),
    providerMetadata: Object.freeze({ ...providerMetadata }),
  });
}

export function createStepTrace(values = []) { return Object.freeze(values.map((v) => Object.freeze({ ...v }))); }
