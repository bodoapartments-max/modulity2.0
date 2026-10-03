/**
 * Modulity 2.0 — Capability Definition Repository Contract
 *
 * Path: workspaces/{workspaceId}/capabilityDefinitions/{definitionId}
 *
 * @module core/capabilities/capabilityDefinitionRepository
 */

/**
 * @typedef {Object} CapabilityDefinitionRepository
 * @property {function(string, Object): Promise<CapabilityDefinition>} create
 * @property {function(string, string): Promise<CapabilityDefinition|null>} getById
 * @property {function(string, Object): Promise<CapabilityDefinition[]>} listByWorkspace
 * @property {function(string, string, Object): Promise<CapabilityDefinition>} update
 * @property {function(string, string, string): Promise<CapabilityDefinition[]>} listByEngine
 */

export default undefined;
