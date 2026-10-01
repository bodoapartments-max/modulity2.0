/**
 * Modulity 2.0 — Form Schema Validator
 *
 * Deterministic validation for Module Form schemas and form values.
 * React-independent — reusable by Web UI, Mobile, Agent, API, Import.
 *
 * Uses the shared field primitives from core/data/entityType.js.
 * ONE field system, not parallel architectures.
 *
 * @module modules/forms/formSchemaValidator
 */

import { validateFieldDefinitions, validateFieldValue, FIELD_TYPES } from '../../core/data/entityType.js';
import { validateEntityReference } from '../../core/data/entity.js';

/**
 * Validates a Form Schema definition (the schema itself, not submitted values).
 *
 * @param {import('../module.js').FormSchema} formSchema
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFormSchema(formSchema) {
  const errors = [];

  if (!formSchema || typeof formSchema !== 'object') {
    return { valid: false, errors: ['Form schema is required'] };
  }

  if (!formSchema.schemaVersion) {
    errors.push('Form schema version is required');
  }

  if (!Array.isArray(formSchema.fields)) {
    errors.push('Form schema fields must be an array');
    return { valid: false, errors };
  }

  if (formSchema.fields.length === 0) {
    errors.push('Form schema must have at least one field');
    return { valid: false, errors };
  }

  // Validate field definitions using shared primitives (all FIELD_TYPES allowed for forms)
  const fieldResult = validateFieldDefinitions(formSchema.fields);
  if (!fieldResult.valid) {
    errors.push(...fieldResult.errors);
  }

  // Additional form-specific validations
  for (const field of formSchema.fields) {
    // Entity reference fields should declare which entity type they reference
    if (field.type === FIELD_TYPES.ENTITY_REFERENCE && !field.entityTypeId) {
      errors.push(`Entity reference field "${field.key}" should declare entityTypeId`);
    }

    // Validate select options are {value, label} or strings
    if (field.type === FIELD_TYPES.SELECT && Array.isArray(field.options)) {
      for (const opt of field.options) {
        if (typeof opt === 'object' && opt !== null) {
          if (!opt.value || !opt.label) {
            errors.push(`Select field "${field.key}" options must have value and label`);
            break;
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates form values against a Form Schema.
 * Returns structured errors keyed by field key.
 *
 * @param {Object} values — user-submitted form data
 * @param {import('../../core/data/entityType.js').FieldDefinition[]} fields — the form fields
 * @returns {{ valid: boolean, errors: Object<string, string> }}
 */
export function validateFormValues(values, fields) {
  const errors = {};
  const data = values || {};
  const declaredKeys = new Set(fields.map((f) => f.key));

  for (const field of fields) {
    const value = data[field.key];
    const error = validateFieldValue(value, field);
    if (error) {
      errors[field.key] = error;
    }

    // Extra structural validation for entity references
    if (field.type === FIELD_TYPES.ENTITY_REFERENCE && value && typeof value === 'object') {
      const refResult = validateEntityReference(value);
      if (!refResult.valid) {
        errors[field.key] = refResult.errors.join(', ');
      }
      // Verify entityTypeId matches the field's declared type
      if (field.entityTypeId && value.entityTypeId && value.entityTypeId !== field.entityTypeId) {
        errors[field.key] = `Expected entity type ${field.entityTypeId}, got ${value.entityTypeId}`;
      }
    }
  }

  // Reject undeclared fields (strict schema governance)
  for (const key of Object.keys(data)) {
    if (!declaredKeys.has(key)) {
      errors[key] = `Undeclared field: "${key}" is not in the form schema`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Extracts entity references from form values based on schema field types.
 * Returns canonical EntityReference objects for Record storage.
 *
 * @param {Object} values — validated form data
 * @param {import('../../core/data/entityType.js').FieldDefinition[]} fields
 * @returns {import('../../core/data/entity.js').EntityReference[]}
 */
export function extractEntityReferences(values, fields) {
  const refs = [];
  for (const field of fields) {
    if (field.type === FIELD_TYPES.ENTITY_REFERENCE) {
      const value = values[field.key];
      if (value && typeof value === 'object' && value.entityId) {
        refs.push({
          entityId: value.entityId,
          entityTypeId: value.entityTypeId,
          workspaceId: value.workspaceId,
        });
      }
    }
  }
  return refs;
}
