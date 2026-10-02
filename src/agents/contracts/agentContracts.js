export const AGENT_CONTRACT_VERSION = '1.0.0';
export const AGENT_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' });
export const AGENT_EXECUTION_STATUSES = Object.freeze({ SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', TIMED_OUT: 'TIMED_OUT' });
export const AGENT_PROVIDER_TYPES = Object.freeze({ DETERMINISTIC_TEST: 'DETERMINISTIC_TEST', REMOTE_LLM: 'REMOTE_LLM', LOCAL_LLM: 'LOCAL_LLM', EXTERNAL_AGENT: 'EXTERNAL_AGENT' });
export const AGENT_LIMITS = Object.freeze({ MAX_INPUT_BYTES: 64_000, MAX_OUTPUT_BYTES: 256_000, MAX_CONTEXT_KEYS: 32, MIN_TIMEOUT_MS: 1, MAX_TIMEOUT_MS: 120_000 });

const DEFINITION_KEYS = new Set(['agentId', 'agentCode', 'name', 'description', 'version', 'capability', 'inputSchemaVersion', 'outputSchemaVersion', 'status', 'providerAdapter', 'timeoutPolicy', 'metadata']);
const REQUEST_KEYS = new Set(['requestId', 'workspaceId', 'agentCode', 'agentVersion', 'inputSchemaVersion', 'outputSchemaVersion', 'requestedBy', 'input', 'context']);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
}

function assertStrictKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unknown properties: ${unknown.join(', ')}`);
}

function serializedBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { throw new Error('Agent payload must be serializable'); }
}

export function createAgentDefinition(definition) {
  assertPlainObject(definition, 'AgentDefinition');
  assertStrictKeys(definition, DEFINITION_KEYS, 'AgentDefinition');
  for (const key of ['agentId', 'agentCode', 'name', 'version', 'capability', 'inputSchemaVersion', 'outputSchemaVersion', 'providerAdapter']) {
    if (!definition[key] || typeof definition[key] !== 'string') throw new Error(`${key} is required`);
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(definition.agentCode)) throw new Error('agentCode must be uppercase letters, digits, and underscores');
  if (!Object.values(AGENT_STATUSES).includes(definition.status)) throw new Error('Invalid Agent status');
  if (!Object.values(AGENT_PROVIDER_TYPES).includes(definition.providerAdapter)) throw new Error('Unsupported provider adapter');
  const timeoutMs = definition.timeoutPolicy?.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < AGENT_LIMITS.MIN_TIMEOUT_MS || timeoutMs > AGENT_LIMITS.MAX_TIMEOUT_MS) throw new Error('Invalid Agent timeout policy');
  return Object.freeze({ ...definition, timeoutPolicy: Object.freeze({ timeoutMs }), metadata: Object.freeze({ ...(definition.metadata || {}) }) });
}

export function createAgentExecutionRequest(request) {
  assertPlainObject(request, 'AgentExecutionRequest');
  assertStrictKeys(request, REQUEST_KEYS, 'AgentExecutionRequest');
  for (const key of ['requestId', 'workspaceId', 'agentCode', 'agentVersion', 'inputSchemaVersion', 'outputSchemaVersion', 'requestedBy']) {
    if (!request[key] || typeof request[key] !== 'string') throw new Error(`${key} is required`);
  }
  assertPlainObject(request.input, 'Agent input');
  assertPlainObject(request.context || {}, 'Agent context');
  if (Object.keys(request.context || {}).length > AGENT_LIMITS.MAX_CONTEXT_KEYS) throw new Error('Agent context exceeds key limit');
  if (serializedBytes(request.input) > AGENT_LIMITS.MAX_INPUT_BYTES) throw new Error('Agent input exceeds size limit');
  return Object.freeze({ ...request, input: Object.freeze({ ...request.input }), context: Object.freeze({ ...(request.context || {}) }) });
}

export function assertAgentOutput(output) {
  assertPlainObject(output, 'Agent output');
  if (serializedBytes(output) > AGENT_LIMITS.MAX_OUTPUT_BYTES) throw new Error('Agent output exceeds size limit');
  return output;
}

export function createAgentExecutionResult({ request, definition, status, output = null, warnings = [], errors = [], startedAt, completedAt }) {
  if (!Object.values(AGENT_EXECUTION_STATUSES).includes(status)) throw new Error('Invalid execution status');
  return Object.freeze({
    requestId: request.requestId, workspaceId: request.workspaceId, agentCode: definition.agentCode, agentVersion: definition.version,
    inputSchemaVersion: definition.inputSchemaVersion, outputSchemaVersion: definition.outputSchemaVersion, status,
    output: output ? Object.freeze({ ...output }) : null, warnings: Object.freeze([...warnings]), errors: Object.freeze([...errors]),
    startedAt, completedAt,
    provenance: Object.freeze({ requestedBy: request.requestedBy, providerAdapter: definition.providerAdapter, agentId: definition.agentId, contractVersion: AGENT_CONTRACT_VERSION }),
  });
}
