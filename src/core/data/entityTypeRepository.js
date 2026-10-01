/**
 * Modulity 2.0 — EntityType Repository Contract
 *
 * Provider-independent interface for EntityType persistence.
 *
 * @module core/data/entityTypeRepository
 */

/**
 * @typedef {Object} EntityTypeRepository
 * @property {function(string, string): Promise<EntityType|null>} getById
 * @property {function(string, string): Promise<EntityType|null>} getByCode
 * @property {function(string): Promise<EntityType[]>} listByWorkspace
 * @property {function(string, string): Promise<EntityType[]>} listByCategory
 * @property {function(EntityType): Promise<EntityType>} create
 * @property {function(string, string, Object): Promise<EntityType>} update
 * @property {function(string, EntityType): Promise<void>} seed — idempotent core type seeding
 */

// Contract-only module — no runtime export needed.
export default undefined;
