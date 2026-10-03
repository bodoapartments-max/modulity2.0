export const CAPABILITY_CONTRACT_VERSION = '1.0.0';
export const CAPABILITY_AVAILABILITY = Object.freeze({ ARCHITECTURE_ONLY: 'ARCHITECTURE_ONLY', AVAILABLE: 'AVAILABLE', DISABLED: 'DISABLED', UNAVAILABLE: 'UNAVAILABLE' });
export const CAPABILITY_MODES = Object.freeze({ READ: 'READ', ACTION: 'ACTION' });
export const CAPABILITY_SOURCE_KINDS = Object.freeze({ MODULE: 'MODULE', ENTITY_TYPE: 'ENTITY_TYPE', WORKSET: 'WORKSET' });
export const CAPABILITY_DEFINITION_STATUSES = Object.freeze({ DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', ARCHIVED: 'ARCHIVED' });
export const CAPABILITY_LIMITS = Object.freeze({ MAX_DEFINITION_BYTES: 16_000, MAX_CONFIGURATION_DEPTH: 8, MAX_CONFIGURATION_KEYS: 100, MAX_DEPENDENCIES: 20, MAX_CAPABILITIES: 50 });

const DESCRIPTOR_KEYS = new Set(['engineId', 'contractVersion', 'name', 'description', 'availability', 'mode', 'definitionTypes', 'supportedSourceKinds', 'capabilities', 'requires', 'optionalDependencies']);
const DEFINITION_KEYS = new Set(['definitionId', 'definitionVersion', 'engineId', 'contractVersion', 'workspaceId', 'source', 'configuration', 'status']);
const SOURCE_KEYS = new Set(['kind', 'ref', 'workspaceId']);
const BINDING_KEYS = new Set(['engineId', 'contractVersion', 'definitionRef', 'sourceRef']);
const UNSAFE_KEYS = new Set(['collectionPath', 'firestorePath', 'rawQuery', 'script', 'scriptUrl', 'moduleUrl', 'executable', 'expression', 'eval', 'function', 'componentCode', 'jsx']);

function plain(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`); }
function strict(value, keys, label) { const unknown = Object.keys(value).filter((key) => !keys.has(key)); if (unknown.length) throw new Error(`${label} contains unknown properties: ${unknown.join(', ')}`); }
function text(value, label) { if (!value || typeof value !== 'string') throw new Error(`${label} is required`); }
function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
function frozenStrings(value, label, max = CAPABILITY_LIMITS.MAX_CAPABILITIES) { if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item) || value.length > max) throw new Error(`${label} must be a bounded string array`); return Object.freeze([...value]); }
function validateConfiguration(value, state = { keys: 0 }, depth = 0) {
  if (depth > CAPABILITY_LIMITS.MAX_CONFIGURATION_DEPTH) throw new Error('Capability configuration exceeds depth limit');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('Capability configuration cannot contain executable values');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    state.keys += 1;
    if (state.keys > CAPABILITY_LIMITS.MAX_CONFIGURATION_KEYS) throw new Error('Capability configuration exceeds key limit');
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe capability configuration key: ${key}`);
    validateConfiguration(child, state, depth + 1);
  }
}

export function createCapabilityEngineDescriptor(value) {
  plain(value, 'CapabilityEngineDescriptor');
  strict(value, DESCRIPTOR_KEYS, 'CapabilityEngineDescriptor');
  for (const key of ['engineId', 'contractVersion', 'name', 'description']) text(value[key], `CapabilityEngineDescriptor.${key}`);
  if (!/^[a-z][a-z0-9-]*$/.test(value.engineId)) throw new Error('engineId must be a stable lowercase identifier');
  if (value.contractVersion !== CAPABILITY_CONTRACT_VERSION) throw new Error('Unsupported Capability Engine contract version');
  if (!Object.values(CAPABILITY_AVAILABILITY).includes(value.availability)) throw new Error('Invalid capability availability');
  if (!Object.values(CAPABILITY_MODES).includes(value.mode)) throw new Error('Invalid capability mode');
  const definitionTypes = frozenStrings(value.definitionTypes || [], 'definitionTypes');
  const supportedSourceKinds = frozenStrings(value.supportedSourceKinds || [], 'supportedSourceKinds');
  if (supportedSourceKinds.some((kind) => !Object.values(CAPABILITY_SOURCE_KINDS).includes(kind))) throw new Error('Unsupported capability source kind');
  return Object.freeze({ ...value, definitionTypes, supportedSourceKinds, capabilities: frozenStrings(value.capabilities || [], 'capabilities'), requires: frozenStrings(value.requires || [], 'requires', CAPABILITY_LIMITS.MAX_DEPENDENCIES), optionalDependencies: frozenStrings(value.optionalDependencies || [], 'optionalDependencies', CAPABILITY_LIMITS.MAX_DEPENDENCIES) });
}

export function createCapabilitySourceRef(value, expectedWorkspaceId = null) {
  plain(value, 'CapabilitySourceRef');
  strict(value, SOURCE_KEYS, 'CapabilitySourceRef');
  if (!Object.values(CAPABILITY_SOURCE_KINDS).includes(value.kind)) throw new Error('Unsupported capability source kind');
  text(value.ref, 'CapabilitySourceRef.ref');
  text(value.workspaceId, 'CapabilitySourceRef.workspaceId');
  const prefixes = { MODULE: 'module:', ENTITY_TYPE: 'entityType:', WORKSET: 'workset:' };
  if (!value.ref.startsWith(prefixes[value.kind]) || !/^[A-Za-z0-9:_-]+$/.test(value.ref)) throw new Error('Capability source ref must be a typed canonical reference');
  if (expectedWorkspaceId && value.workspaceId !== expectedWorkspaceId) throw new Error('Cross-Workspace capability source is denied');
  return Object.freeze({ ...value });
}

export function createCapabilityDefinition(value) {
  plain(value, 'CapabilityDefinition');
  strict(value, DEFINITION_KEYS, 'CapabilityDefinition');
  for (const key of ['definitionId', 'definitionVersion', 'engineId', 'contractVersion', 'workspaceId']) text(value[key], `CapabilityDefinition.${key}`);
  if (!/^[A-Za-z0-9:_-]+$/.test(value.definitionId)) throw new Error('Invalid Capability Definition identity');
  if (value.contractVersion !== CAPABILITY_CONTRACT_VERSION || value.definitionVersion !== '1.0.0') throw new Error('Unsupported Capability Definition version');
  if (!Object.values(CAPABILITY_DEFINITION_STATUSES).includes(value.status)) throw new Error('Invalid Capability Definition status');
  const source = createCapabilitySourceRef(value.source, value.workspaceId);
  plain(value.configuration, 'CapabilityDefinition.configuration');
  validateConfiguration(value.configuration);
  if (bytes(value) > CAPABILITY_LIMITS.MAX_DEFINITION_BYTES) throw new Error('Capability Definition exceeds size limit');
  return Object.freeze({ ...structuredClone(value), source });
}

export function createCapabilityBinding(value) {
  plain(value, 'CapabilityBinding');
  strict(value, BINDING_KEYS, 'CapabilityBinding');
  for (const key of BINDING_KEYS) text(value[key], `CapabilityBinding.${key}`);
  if (value.contractVersion !== CAPABILITY_CONTRACT_VERSION) throw new Error('Unsupported Capability Binding version');
  if (!/^[A-Za-z0-9:_-]+$/.test(value.definitionRef) || !/^[A-Za-z0-9:_-]+$/.test(value.sourceRef)) throw new Error('Capability Binding requires canonical references');
  return Object.freeze({ ...value });
}

export function assertCapabilityConfigurationSafe(configuration) {
  plain(configuration, 'Capability configuration');
  validateConfiguration(configuration);
  return true;
}
