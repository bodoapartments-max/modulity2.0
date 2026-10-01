/**
 * Modulity 2.0 — Relationship Repository Contract
 *
 * @module core/data/relationshipRepository
 */

/**
 * @typedef {Object} RelationshipRepository
 * @property {function(string, string): Promise<Relationship|null>} getById — (workspaceId, relationshipId)
 * @property {function(string, string, string): Promise<Relationship[]>} listForObject — (workspaceId, objectType, objectId)
 * @property {function(string): Promise<Relationship[]>} listByWorkspace
 * @property {function(Relationship): Promise<Relationship>} create
 * @property {function(string, string, Object): Promise<Relationship>} update — (workspaceId, relationshipId, changes)
 */

export default undefined;
