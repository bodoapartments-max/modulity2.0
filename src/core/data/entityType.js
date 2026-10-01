/**
 * Modulity 2.0 — Entity Type
 *
 * Defines the shape of an Entity Type in the registry.
 * Core types are platform-defined. Domain types are organization-defined.
 *
 * @module core/data/entityType
 */

export const ENTITY_TYPE_CATEGORIES = Object.freeze({
  CORE: 'CORE',
  DOMAIN: 'DOMAIN',
});

export const ENTITY_TYPE_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  ARCHIVED: 'ARCHIVED',
});

/**
 * Supported field types for entity schema definitions.
 * The future Form Engine will reuse these.
 */
export const FIELD_TYPES = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  ENTITY_REFERENCE: 'entity-reference',
  FILE_REFERENCE: 'file-reference',
});

/**
 * @typedef {Object} FieldDefinition
 * @property {string} key        — machine-readable field name
 * @property {string} label      — human-readable label
 * @property {string} type       — one of FIELD_TYPES
 * @property {boolean} required
 * @property {Object} [options]  — type-specific config (e.g. select options, min/max)
 */

/**
 * @typedef {Object} EntityType
 * @property {string} typeId
 * @property {string} code           — stable machine identifier (e.g. 'ROOM')
 * @property {string} name           — human-readable name
 * @property {string} category       — CORE or DOMAIN
 * @property {string} description
 * @property {string} icon           — optional icon identifier
 * @property {string} status         — one of ENTITY_TYPE_STATUSES
 * @property {string} schemaVersion  — version of the field schema
 * @property {FieldDefinition[]} fields — typed field definitions
 * @property {string} workspaceId    — workspace this type belongs to
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates an EntityType value object.
 *
 * @param {Object} params
 * @returns {EntityType}
 */
export function createEntityType({
  typeId,
  code,
  name,
  category,
  description = '',
  icon = '',
  status = ENTITY_TYPE_STATUSES.ACTIVE,
  schemaVersion = '1.0.0',
  fields = [],
  workspaceId,
  createdAt,
  updatedAt,
}) {
  if (!typeId) throw new Error('typeId is required');
  if (!code) throw new Error('code is required');
  if (!name) throw new Error('name is required');
  if (!ENTITY_TYPE_CATEGORIES[category]) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!ENTITY_TYPE_STATUSES[status]) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Array.isArray(fields)) throw new Error('fields must be an array');

  for (const field of fields) {
    if (!field.key) throw new Error('Field key is required');
    if (!field.label) throw new Error('Field label is required');
    if (!field.type) throw new Error('Field type is required');
  }

  return Object.freeze({
    typeId,
    code,
    name,
    category,
    description,
    icon,
    status,
    schemaVersion,
    fields: Object.freeze(fields.map((f) => Object.freeze({ ...f }))),
    workspaceId,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Validates a field definition.
 *
 * @param {FieldDefinition} field
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFieldDefinition(field) {
  const errors = [];
  if (!field.key) errors.push('Field key is required');
  if (!field.label) errors.push('Field label is required');
  if (!field.type) errors.push('Field type is required');
  if (field.type && !Object.values(FIELD_TYPES).includes(field.type)) {
    errors.push(`Unknown field type: ${field.type}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates entity data against the type's field definitions.
 *
 * @param {Object} data
 * @param {FieldDefinition[]} fields
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateEntityData(data, fields) {
  const errors = {};
  for (const field of fields) {
    if (field.required && (data[field.key] === undefined || data[field.key] === null || data[field.key] === '')) {
      errors[field.key] = `${field.label} is required`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
