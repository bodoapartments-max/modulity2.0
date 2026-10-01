/**
 * Modulity 2.0 — Entity
 *
 * A persistent business identity (Employee, Vehicle, Room, etc.).
 * Entities exist independently from the Module/Form that creates them.
 *
 * @module core/data/entity
 */

export const ENTITY_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
});

/**
 * @typedef {Object} EntityReference
 * @property {string} entityId
 * @property {string} entityTypeId
 * @property {string} workspaceId
 */

/**
 * @typedef {Object} Entity
 * @property {string} entityId
 * @property {string} workspaceId
 * @property {string} entityTypeId
 * @property {string} displayName
 * @property {string} status
 * @property {Object} data              — type-specific validated attributes
 * @property {string[]} attachments     — file IDs
 * @property {string|null} sourceRecordId
 * @property {string} schemaVersion
 * @property {Object} createdBy         — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates an Entity value object.
 *
 * @param {Object} params
 * @returns {Entity}
 */
export function createEntity({
  entityId,
  workspaceId,
  entityTypeId,
  displayName,
  status = ENTITY_STATUSES.ACTIVE,
  data = {},
  attachments = [],
  sourceRecordId = null,
  schemaVersion = '1.0.0',
  createdBy,
  createdAt,
  updatedAt,
}) {
  if (!entityId) throw new Error('entityId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!entityTypeId) throw new Error('entityTypeId is required');
  if (!displayName) throw new Error('displayName is required');
  if (!ENTITY_STATUSES[status]) {
    throw new Error(`Invalid entity status: ${status}`);
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    entityId,
    workspaceId,
    entityTypeId,
    displayName,
    status,
    data: Object.freeze({ ...data }),
    attachments: Object.freeze([...attachments]),
    sourceRecordId,
    schemaVersion,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Creates an EntityReference value object.
 *
 * @param {Object} params
 * @returns {EntityReference}
 */
export function createEntityReference({ entityId, entityTypeId, workspaceId }) {
  if (!entityId) throw new Error('entityId is required for EntityReference');
  if (!entityTypeId) throw new Error('entityTypeId is required for EntityReference');
  if (!workspaceId) throw new Error('workspaceId is required for EntityReference');

  return Object.freeze({ entityId, entityTypeId, workspaceId });
}
