/**
 * Modulity 2.0 — Relationship
 *
 * Universal links between platform objects (Entity↔Entity, Entity↔Record, etc.)
 * without embedding large nested structures.
 *
 * @module core/data/relationship
 */

export const RELATIONSHIP_OBJECT_TYPES = Object.freeze({
  ENTITY: 'ENTITY',
  RECORD: 'RECORD',
  MODULE: 'MODULE',
  FILE: 'FILE',
});

export const RELATIONSHIP_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Platform-defined relationship types.
 * Organizations may define additional types at runtime.
 */
export const RELATIONSHIP_TYPES = Object.freeze({
  ASSIGNED_TO: 'ASSIGNED_TO',
  USES: 'USES',
  LOCATED_AT: 'LOCATED_AT',
  BELONGS_TO: 'BELONGS_TO',
  RELATED_TO: 'RELATED_TO',
  PARENT_OF: 'PARENT_OF',
  CHILD_OF: 'CHILD_OF',
  PART_OF: 'PART_OF',
});

/**
 * @typedef {Object} RelationshipEndpoint
 * @property {string} objectType — one of RELATIONSHIP_OBJECT_TYPES
 * @property {string} objectId
 */

/**
 * @typedef {Object} Relationship
 * @property {string} relationshipId
 * @property {string} workspaceId
 * @property {RelationshipEndpoint} source
 * @property {string} relationshipType
 * @property {RelationshipEndpoint} target
 * @property {Object} metadata     — optional extra context
 * @property {string} status
 * @property {Object} createdBy    — ActorRef
 * @property {string} createdAt
 */

/**
 * Creates a Relationship value object.
 *
 * @param {Object} params
 * @returns {Relationship}
 */
export function createRelationship({
  relationshipId,
  workspaceId,
  source,
  relationshipType,
  target,
  metadata = {},
  status = RELATIONSHIP_STATUSES.ACTIVE,
  createdBy,
  createdAt,
}) {
  if (!relationshipId) throw new Error('relationshipId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!source) throw new Error('source is required');
  if (!source.objectType || !RELATIONSHIP_OBJECT_TYPES[source.objectType]) {
    throw new Error(`Invalid source objectType: ${source?.objectType}`);
  }
  if (!source.objectId) throw new Error('source.objectId is required');
  if (!relationshipType) throw new Error('relationshipType is required');
  if (!target) throw new Error('target is required');
  if (!target.objectType || !RELATIONSHIP_OBJECT_TYPES[target.objectType]) {
    throw new Error(`Invalid target objectType: ${target?.objectType}`);
  }
  if (!target.objectId) throw new Error('target.objectId is required');
  if (!RELATIONSHIP_STATUSES[status]) {
    throw new Error(`Invalid relationship status: ${status}`);
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    relationshipId,
    workspaceId,
    source: Object.freeze({ ...source }),
    relationshipType,
    target: Object.freeze({ ...target }),
    metadata: Object.freeze({ ...metadata }),
    status,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
  });
}
