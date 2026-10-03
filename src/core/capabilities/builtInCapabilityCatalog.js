import { CAPABILITY_AVAILABILITY, CAPABILITY_CONTRACT_VERSION, CAPABILITY_MODES, CAPABILITY_SOURCE_KINDS } from './capabilityContracts.js';
import { CapabilityEngineRegistry } from './capabilityEngineRegistry.js';
import { CALENDAR_DEFINITION_TYPE, validateCalendarDefinitionV1 } from './calendarDefinitionV1.js';

const descriptor = (engineId, name, mode, description, options = {}) => ({ engineId, contractVersion: CAPABILITY_CONTRACT_VERSION, name, description, availability: CAPABILITY_AVAILABILITY.ARCHITECTURE_ONLY, mode, definitionTypes: options.definitionTypes || [], supportedSourceKinds: options.supportedSourceKinds || [CAPABILITY_SOURCE_KINDS.MODULE], capabilities: options.capabilities || [], requires: options.requires || [], optionalDependencies: options.optionalDependencies || [] });

export const BUILT_IN_CAPABILITY_DESCRIPTORS = Object.freeze([
  descriptor('approval', 'Approval', CAPABILITY_MODES.ACTION, 'Trusted approval policies and canonical state transitions.', { capabilities: ['approval-policy', 'state-transition'], optionalDependencies: ['notification'] }),
  descriptor('calendar', 'Calendar', CAPABILITY_MODES.READ, 'Derived time-based projections over canonical Records.', { definitionTypes: [CALENDAR_DEFINITION_TYPE], capabilities: ['time-mapping', 'record-projection'] }),
  descriptor('document', 'Document', CAPABILITY_MODES.READ, 'Document-oriented projections and lifecycle integration.', { supportedSourceKinds: [CAPABILITY_SOURCE_KINDS.MODULE, CAPABILITY_SOURCE_KINDS.ENTITY_TYPE], capabilities: ['document-projection'] }),
  descriptor('integration', 'Integration', CAPABILITY_MODES.ACTION, 'Trusted versioned external API/event/command integration boundary.', { capabilities: ['external-command', 'external-event'] }),
  descriptor('inventory', 'Inventory', CAPABILITY_MODES.READ, 'Derived stock projections from canonical movement Records.', { capabilities: ['stock-projection'] }),
  descriptor('notification', 'Notification', CAPABILITY_MODES.ACTION, 'Trusted notification dispatch driven by canonical events and policies.', { capabilities: ['notification-policy', 'delivery-journal'] }),
  descriptor('scheduling', 'Scheduling', CAPABILITY_MODES.ACTION, 'Trusted allocation and scheduling commands using Calendar semantics.', { capabilities: ['resource-allocation'], requires: ['calendar'] }),
  descriptor('task', 'Task', CAPABILITY_MODES.ACTION, 'Trusted task orchestration around canonical business state.', { capabilities: ['task-assignment', 'task-state'] }),
  descriptor('workflow', 'Workflow', CAPABILITY_MODES.ACTION, 'Trusted deterministic transitions and commands over canonical state.', { capabilities: ['transition-policy', 'command-journal'], optionalDependencies: ['notification'] }),
]);

export function createBuiltInCapabilityRegistry() {
  const registry = new CapabilityEngineRegistry();
  for (const item of BUILT_IN_CAPABILITY_DESCRIPTORS) registry.register(item, item.engineId === 'calendar' ? { definitionValidator: validateCalendarDefinitionV1 } : {});
  return registry;
}

export function createArchitectCapabilityCatalog(registry = createBuiltInCapabilityRegistry()) {
  return Object.freeze(registry.list().map((item) => Object.freeze({ engineId: item.engineId, contractVersion: item.contractVersion, name: item.name, description: item.description, availability: item.availability, mode: item.mode, supportedSourceKinds: [...item.supportedSourceKinds], definitionTypes: [...item.definitionTypes], capabilities: [...item.capabilities], operational: item.availability === CAPABILITY_AVAILABILITY.AVAILABLE })));
}
