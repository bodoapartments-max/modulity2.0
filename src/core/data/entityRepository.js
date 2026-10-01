/**
 * Modulity 2.0 — Entity Repository Contract
 *
 * Provider-independent interface for Entity persistence.
 *
 * @module core/data/entityRepository
 */

/**
 * @typedef {Object} EntityRepository
 * @property {function(string, string): Promise<Entity|null>} getById — (workspaceId, entityId)
 * @property {function(string): Promise<Entity[]>} listByWorkspace
 * @property {function(string, string): Promise<Entity[]>} listByType — (workspaceId, entityTypeId)
 * @property {function(string, Object): Promise<Entity[]>} query — (workspaceId, filters)
 * @property {function(Entity): Promise<Entity>} create
 * @property {function(string, string, Object): Promise<Entity>} update — (workspaceId, entityId, changes)
 */

// Contract-only module.
export default undefined;
