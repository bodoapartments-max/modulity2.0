import { CAPABILITY_AVAILABILITY, CAPABILITY_LIMITS, createCapabilityDefinition, createCapabilityEngineDescriptor } from './capabilityContracts.js';

export class CapabilityEngineRegistry {
  constructor() {
    this.engines = new Map();
  }

  register(descriptorValue, { definitionValidator = null } = {}) {
    const descriptor = createCapabilityEngineDescriptor(descriptorValue);
    const key = `${descriptor.engineId}@${descriptor.contractVersion}`;
    if (this.engines.has(key)) throw new Error(`Capability Engine already registered: ${key}`);
    if (this.engines.size >= CAPABILITY_LIMITS.MAX_CAPABILITIES) throw new Error('Capability Engine Registry limit exceeded');
    if (definitionValidator !== null && typeof definitionValidator !== 'function') throw new Error('Definition validator must be a trusted function');
    this.engines.set(key, Object.freeze({ descriptor, definitionValidator }));
    try { this.assertAcyclic(); } catch (error) { this.engines.delete(key); throw error; }
    return descriptor;
  }

  get(engineId, contractVersion = '1.0.0') {
    return this.engines.get(`${engineId}@${contractVersion}`)?.descriptor || null;
  }

  has(engineId, contractVersion = '1.0.0') {
    return this.engines.has(`${engineId}@${contractVersion}`);
  }

  list() {
    return [...this.engines.values()].map((entry) => entry.descriptor).sort((left, right) => `${left.engineId}@${left.contractVersion}`.localeCompare(`${right.engineId}@${right.contractVersion}`));
  }

  assertAcyclic() {
    const descriptors = this.list();
    const byId = new Map(descriptors.map((item) => [item.engineId, item]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (engineId) => {
      if (visiting.has(engineId)) throw new Error(`Capability Engine dependency cycle detected at ${engineId}`);
      if (visited.has(engineId) || !byId.has(engineId)) return;
      visiting.add(engineId);
      for (const dependency of [...byId.get(engineId).requires, ...byId.get(engineId).optionalDependencies]) visit(dependency);
      visiting.delete(engineId);
      visited.add(engineId);
    };
    descriptors.forEach((item) => visit(item.engineId));
    return true;
  }

  async validateDefinition(value, context = {}) {
    const issues = [];
    let definition;
    try { definition = createCapabilityDefinition(value); } catch (error) { return Object.freeze({ valid: false, operational: false, definition: null, issues: Object.freeze([{ code: 'INVALID_DEFINITION', message: error.message }]) }); }
    const entry = this.engines.get(`${definition.engineId}@${definition.contractVersion}`);
    if (!entry) issues.push({ code: 'UNKNOWN_ENGINE', message: `Unknown Capability Engine: ${definition.engineId}@${definition.contractVersion}` });
    if (entry && !entry.descriptor.supportedSourceKinds.includes(definition.source.kind)) issues.push({ code: 'UNSUPPORTED_SOURCE_KIND', message: `${definition.source.kind} is not supported by ${definition.engineId}` });
    if (context.workspaceId && definition.workspaceId !== context.workspaceId) issues.push({ code: 'WORKSPACE_MISMATCH', message: 'Capability Definition belongs to another Workspace' });
    let source = null;
    if (typeof context.resolveSource !== 'function') issues.push({ code: 'SOURCE_RESOLVER_REQUIRED', message: 'Canonical source resolver is required' });
    else {
      try { source = await context.resolveSource(definition.source); } catch (error) { issues.push({ code: 'SOURCE_RESOLUTION_FAILED', message: error.message }); }
      if (!source) issues.push({ code: 'UNKNOWN_SOURCE', message: `Unknown canonical source: ${definition.source.ref}` });
      else {
        if (source.workspaceId !== definition.workspaceId) issues.push({ code: 'CROSS_WORKSPACE_SOURCE', message: 'Resolved source belongs to another Workspace' });
        if (source.kind !== definition.source.kind) issues.push({ code: 'SOURCE_KIND_MISMATCH', message: 'Resolved source kind does not match Definition source kind' });
      }
    }
    if (entry?.definitionValidator && source) {
      const result = await entry.definitionValidator(definition, { ...context, source });
      if (!result?.valid) issues.push(...(result?.issues || [{ code: 'ENGINE_VALIDATION_FAILED', message: 'Engine-specific validation failed' }]));
    }
    const operational = Boolean(entry && entry.descriptor.availability === CAPABILITY_AVAILABILITY.AVAILABLE && issues.length === 0);
    if (entry && definition.status === 'ACTIVE' && entry.descriptor.availability !== CAPABILITY_AVAILABILITY.AVAILABLE) issues.push({ code: 'ENGINE_NOT_AVAILABLE', message: `${definition.engineId} is ${entry.descriptor.availability}, not operational` });
    return Object.freeze({ valid: issues.length === 0, operational: operational && definition.status === 'ACTIVE', definition, source, issues: Object.freeze(issues) });
  }
}
