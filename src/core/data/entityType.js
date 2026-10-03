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
 * Supported field types shared across Entity Type schemas and Module Form schemas.
 * One coherent field system — Entity Types and Modules use the same primitives.
 *
 * Core types (usable in Entity Type schemas and Form schemas):
 *   text, number, date, boolean, select, entity-reference, file-reference
 *
 * Extended types (usable in Form schemas, not typical for Entity Type schemas):
 *   textarea, email, phone, url, datetime, date-range
 */
export const FIELD_TYPES = Object.freeze({
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  DATE: 'date',
  DATETIME: 'datetime',
  DATE_RANGE: 'date-range',
  BOOLEAN: 'boolean',
  SELECT: 'select',
  EMAIL: 'email',
  PHONE: 'phone',
  URL: 'url',
  ENTITY_REFERENCE: 'entity-reference',
  FILE_REFERENCE: 'file-reference',
});

/**
 * Field types valid for Entity Type schemas (subset of all FIELD_TYPES).
 * Entity Types use the core field primitives.
 */
export const ENTITY_FIELD_TYPES = Object.freeze([
  FIELD_TYPES.TEXT,
  FIELD_TYPES.NUMBER,
  FIELD_TYPES.DATE,
  FIELD_TYPES.BOOLEAN,
  FIELD_TYPES.SELECT,
  FIELD_TYPES.ENTITY_REFERENCE,
  FIELD_TYPES.FILE_REFERENCE,
]);

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
 * Regular expression for valid field keys: alphanumeric + underscore, starting with a letter.
 */
const FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Canonical date format: ISO 8601 date string (YYYY-MM-DD).
 * Full ISO datetime strings are also accepted.
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Canonical datetime format: ISO 8601 datetime with time component required.
 */
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

/** Basic email pattern (not exhaustive; server should verify). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Basic phone pattern: allows digits, spaces, dashes, parens, +. */
const PHONE_PATTERN = /^[+]?[\d\s\-().]{3,30}$/;

/** Basic URL pattern: http(s) required. */
const URL_PATTERN = /^https?:\/\/.+/;

/**
 * Validates a field definition.
 *
 * @param {FieldDefinition} field
 * @param {Object} [opts]
 * @param {string[]} [opts.allowedTypes] — restrict to a subset (e.g. ENTITY_FIELD_TYPES)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFieldDefinition(field, opts = {}) {
  const errors = [];
  const allowedTypes = opts.allowedTypes || Object.values(FIELD_TYPES);

  if (!field.key) {
    errors.push('Field key is required');
  } else if (!FIELD_KEY_PATTERN.test(field.key)) {
    errors.push(`Field key "${field.key}" must start with a letter and contain only alphanumeric characters and underscores`);
  }
  if (!field.label) errors.push('Field label is required');
  if (!field.type) {
    errors.push('Field type is required');
  } else if (!allowedTypes.includes(field.type)) {
    errors.push(`Unknown field type: ${field.type}`);
  }

  if (typeof field.required !== 'undefined' && typeof field.required !== 'boolean') {
    errors.push('Field required must be a boolean');
  }

  // Select-specific validation
  if (field.type === FIELD_TYPES.SELECT) {
    if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
      errors.push('Select field must have a non-empty options array');
    }
  }

  // min/max for number fields
  if (field.type === FIELD_TYPES.NUMBER) {
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      errors.push('Field min must not exceed max');
    }
  }

  // minLength/maxLength for text and textarea fields
  if (field.type === FIELD_TYPES.TEXT || field.type === FIELD_TYPES.TEXTAREA) {
    if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
      errors.push('Field minLength must not exceed maxLength');
    }
  }

  // entity-reference must declare entityTypeId
  if (field.type === FIELD_TYPES.ENTITY_REFERENCE) {
    if (field.entityTypeId !== undefined && typeof field.entityTypeId !== 'string') {
      errors.push('Entity reference field entityTypeId must be a string');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a full set of field definitions for uniqueness and consistency.
 *
 * @param {FieldDefinition[]} fields
 * @param {Object} [opts]
 * @param {string[]} [opts.allowedTypes] — restrict to a subset (e.g. ENTITY_FIELD_TYPES)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFieldDefinitions(fields, opts = {}) {
  const errors = [];
  const keys = new Set();
  for (const field of fields) {
    const result = validateFieldDefinition(field, opts);
    if (!result.valid) errors.push(...result.errors);
    if (field.key) {
      if (keys.has(field.key)) {
        errors.push(`Duplicate field key: "${field.key}"`);
      }
      keys.add(field.key);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a single field value against its field definition.
 *
 * @param {*} value
 * @param {FieldDefinition} field
 * @returns {string|null} — error message or null if valid
 */
export function validateFieldValue(value, field) {
  const isEmpty = value === undefined || value === null || value === '';
  if (isEmpty) {
    return field.required ? `${field.label} is required` : null;
  }

  switch (field.type) {
    case FIELD_TYPES.TEXT: {
      if (typeof value !== 'string') return `${field.label} must be a string`;
      if (field.minLength !== undefined && value.length < field.minLength) {
        return `${field.label} must be at least ${field.minLength} characters`;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        return `${field.label} must be at most ${field.maxLength} characters`;
      }
      return null;
    }

    case FIELD_TYPES.TEXTAREA: {
      if (typeof value !== 'string') return `${field.label} must be a string`;
      if (field.minLength !== undefined && value.length < field.minLength) {
        return `${field.label} must be at least ${field.minLength} characters`;
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        return `${field.label} must be at most ${field.maxLength} characters`;
      }
      return null;
    }

    case FIELD_TYPES.NUMBER: {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${field.label} must be a finite number`;
      }
      if (field.min !== undefined && value < field.min) {
        return `${field.label} must be at least ${field.min}`;
      }
      if (field.max !== undefined && value > field.max) {
        return `${field.label} must be at most ${field.max}`;
      }
      return null;
    }

    case FIELD_TYPES.DATE: {
      if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
        return `${field.label} must be a valid ISO date string (YYYY-MM-DD)`;
      }
      if (Number.isNaN(Date.parse(value))) {
        return `${field.label} is not a valid date`;
      }
      return null;
    }

    case FIELD_TYPES.DATETIME: {
      if (typeof value !== 'string' || !ISO_DATETIME_PATTERN.test(value)) {
        return `${field.label} must be a valid ISO datetime string`;
      }
      if (Number.isNaN(Date.parse(value))) {
        return `${field.label} is not a valid datetime`;
      }
      return null;
    }

    case FIELD_TYPES.DATE_RANGE: {
      if (typeof value !== 'object' || value === null) {
        return `${field.label} must be an object with start and end dates`;
      }
      const { start = '', end = '' } = value;
      const startEmpty = start === undefined || start === null || start === '';
      const endEmpty = end === undefined || end === null || end === '';
      if (startEmpty && endEmpty) {
        return field.required ? `${field.label} is required` : null;
      }
      if (startEmpty || endEmpty) {
        return `${field.label} must have both start and end dates`;
      }
      if (typeof start !== 'string' || !ISO_DATE_PATTERN.test(start) || Number.isNaN(Date.parse(start))) {
        return `${field.label} start must be a valid ISO date string (YYYY-MM-DD)`;
      }
      if (typeof end !== 'string' || !ISO_DATE_PATTERN.test(end) || Number.isNaN(Date.parse(end))) {
        return `${field.label} end must be a valid ISO date string (YYYY-MM-DD)`;
      }
      if (Date.parse(start) > Date.parse(end)) {
        return `${field.label} start date cannot be after end date`;
      }
      return null;
    }

    case FIELD_TYPES.BOOLEAN: {
      if (typeof value !== 'boolean') return `${field.label} must be a boolean`;
      return null;
    }

    case FIELD_TYPES.SELECT: {
      if (!field.options || !Array.isArray(field.options)) {
        return `${field.label} has no configured options`;
      }
      // Support both string options and {value, label} object options
      const allowedValues = field.options.map((o) => (typeof o === 'object' && o !== null ? o.value : o));
      if (!allowedValues.includes(value)) {
        return `${field.label} must be one of: ${allowedValues.join(', ')}`;
      }
      return null;
    }

    case FIELD_TYPES.EMAIL: {
      if (typeof value !== 'string') return `${field.label} must be a string`;
      if (!EMAIL_PATTERN.test(value)) {
        return `${field.label} must be a valid email address`;
      }
      return null;
    }

    case FIELD_TYPES.PHONE: {
      if (typeof value !== 'string') return `${field.label} must be a string`;
      if (!PHONE_PATTERN.test(value)) {
        return `${field.label} must be a valid phone number`;
      }
      return null;
    }

    case FIELD_TYPES.URL: {
      if (typeof value !== 'string') return `${field.label} must be a string`;
      if (!URL_PATTERN.test(value)) {
        return `${field.label} must be a valid URL starting with http:// or https://`;
      }
      return null;
    }

    case FIELD_TYPES.ENTITY_REFERENCE: {
      if (typeof value !== 'object' || value === null) {
        return `${field.label} must be an entity reference object`;
      }
      if (!value.entityId || !value.entityTypeId || !value.workspaceId) {
        return `${field.label} must have entityId, entityTypeId, and workspaceId`;
      }
      return null;
    }

    case FIELD_TYPES.FILE_REFERENCE: {
      if (typeof value !== 'string' || value.length === 0) {
        return `${field.label} must be a non-empty file ID string`;
      }
      return null;
    }

    default:
      return `${field.label} has unknown type: ${field.type}`;
  }
}

/**
 * Validates entity data against the type's field definitions.
 * Rejects undeclared fields (strict schema governance).
 *
 * @param {Object} data
 * @param {FieldDefinition[]} fields
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateEntityData(data, fields) {
  const errors = {};
  const declaredKeys = new Set(fields.map((f) => f.key));

  // Validate each declared field
  for (const field of fields) {
    const error = validateFieldValue(data[field.key], field);
    if (error) errors[field.key] = error;
  }

  // Reject undeclared fields
  for (const key of Object.keys(data)) {
    if (!declaredKeys.has(key)) {
      errors[key] = `Undeclared field: "${key}" is not in the schema`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
