import { CAPABILITY_AVAILABILITY, CAPABILITY_CONTRACT_VERSION, CAPABILITY_MODES, CAPABILITY_SOURCE_KINDS } from '../contracts/capabilityContracts.js';
import { CapabilityEngineRegistry } from './capabilityEngineRegistry.js';

const descriptor = (engineId, name, mode, description, options = {}) => ({ engineId, contractVersion: CAPABILITY_CONTRACT_VERSION, name, description, availability: options.availability || CAPABILITY_AVAILABILITY.ARCHITECTURE_ONLY, mode, definitionTypes: options.definitionTypes || [], supportedSourceKinds: options.supportedSourceKinds || [CAPABILITY_SOURCE_KINDS.MODULE], capabilities: options.capabilities || [], requires: options.requires || [], optionalDependencies: options.optionalDependencies || [] });

export const BUILT_IN_CAPABILITY_DESCRIPTORS = Object.freeze([
  descriptor('approval', 'Approval', CAPABILITY_MODES.ACTION, 'Trusted approval policies and canonical state transitions.', { capabilities: ['approval-policy', 'state-transition'], optionalDependencies: ['notification'] }),
  descriptor('calendar', 'Calendar', CAPABILITY_MODES.READ, 'Derived time-based projections over canonical Records.', { availability: CAPABILITY_AVAILABILITY.AVAILABLE, definitionTypes: ['CalendarDefinitionV1'], capabilities: ['time-mapping', 'record-projection'] }),
  descriptor('business-event', 'Business Event Backbone', CAPABILITY_MODES.READ, 'Facts emitted by trusted operations; canonical append-only event persistence.', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['emit', 'retrieve', 'correlate', 'cause-link'],
  }),
  descriptor('document', 'Document', CAPABILITY_MODES.READ, 'Document-oriented projections and lifecycle integration.', { supportedSourceKinds: [CAPABILITY_SOURCE_KINDS.MODULE, CAPABILITY_SOURCE_KINDS.ENTITY_TYPE], capabilities: ['document-projection'] }),
  descriptor('integration', 'Integration', CAPABILITY_MODES.ACTION, 'Trusted versioned external API/event/command integration boundary.', { capabilities: ['external-command', 'external-event'] }),
  descriptor('inventory', 'Inventory', CAPABILITY_MODES.READ, 'Derived stock projections from canonical movement Records.', { capabilities: ['stock-projection'] }),
  descriptor('notification', 'Notification', CAPABILITY_MODES.ACTION, 'Trusted notification dispatch driven by canonical events and policies.', { capabilities: ['notification-policy', 'delivery-journal'] }),
  descriptor('rules', 'Rules / Decision Engine', CAPABILITY_MODES.READ, 'Deterministic declarative Rules / Decision evaluation; canonical Decision-Result surface over Business Events.', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['evaluate', 'validate', 'resolve', 'dry-run'],
    requires: ['business-event'],
  }),
  descriptor('policy-authority', 'Permission / Policy / Authority', CAPABILITY_MODES.READ, 'Canonical Policy/Authority evaluation — AUTO_EXECUTE / APPROVAL_REQUIRED / DENY built on Grants.', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['evaluate', 'decide'],
    requires: ['rules'],
  }),
  descriptor('configuration-lifecycle', 'Configuration Lifecycle & Versioning', CAPABILITY_MODES.READ, 'Trusted configuration — immutable revisions with trusted publication, lifecycle enforcement, immutable history.; automatic rollback and deterministic versioning', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['validate', 'test', 'publish', 'rollback'],
    requires: ['policy-authority'],
  }),
  descriptor('simulation', 'Simulation / Dry-Run Engine', CAPABILITY_MODES.READ, 'Deterministic simulation over existing engines on explicit state overlays; projects BusinessEvents/Transitions without mutation.', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['simulate', 'project', 'dry-run'],
    requires: ['rules', 'policy-authority'],
  }),
  descriptor('agent-runtime', 'Agent Runtime & Live Provider Orchestration', CAPABILITY_MODES.READ, 'Provider-neutral runtime with tools, capabilities, simulation bridges. Agent != Engine; no database authority; provider is an external client', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['run, tool-orchestrate, propose-config, simulate'],
    requires: ['simulation', 'policy-authority'],
  }),
  descriptor('credential-vault', 'Secrets / Credential Vault', CAPABILITY_MODES.READ, 'Trusted canonical credential boundary. Credentials live as identities; raw secret material never follows public surfaces.', {
    availability: CAPABILITY_AVAILABILITY.AVAILABLE,
    capabilities: ['reference', 'resolve-server', 'rotate', 'revoke'],
    requires: [],
  }),
  descriptor('scheduling', 'Scheduling', CAPABILITY_MODES.ACTION, 'Trusted allocation and scheduling commands using Calendar semantics.', { capabilities: ['resource-allocation'], requires: ['calendar'] }),
  descriptor('task', 'Task', CAPABILITY_MODES.ACTION, 'Trusted task orchestration around canonical business state.', { capabilities: ['task-assignment', 'task-state'] }),
  descriptor('workflow', 'Workflow', CAPABILITY_MODES.ACTION, 'Trusted deterministic transitions and commands over canonical state.', { capabilities: ['transition-policy', 'command-journal'], optionalDependencies: ['notification'] }),
]);

export function createBuiltInCapabilityRegistry(engineRegistrars = {}) {
  const registry = new CapabilityEngineRegistry();
  for (const item of BUILT_IN_CAPABILITY_DESCRIPTORS) {
    const registrar = engineRegistrars[item.engineId] || {};
    registry.register(item, { definitionValidator: registrar.definitionValidator || null });
  }
  return registry;
}

export function createArchitectCapabilityCatalog(registry = createBuiltInCapabilityRegistry()) {
  return Object.freeze(registry.list().map((item) => Object.freeze({ engineId: item.engineId, contractVersion: item.contractVersion, name: item.name, description: item.description, availability: item.availability, mode: item.mode, supportedSourceKinds: [...item.supportedSourceKinds], definitionTypes: [...item.definitionTypes], capabilities: [...item.capabilities], operational: item.availability === CAPABILITY_AVAILABILITY.AVAILABLE })));
}
