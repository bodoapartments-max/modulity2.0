/**
 * Modulity 2.0 — Module Definition
 *
 * A Module is a DEFINITION — configuration, not custom software.
 * MODULE != FORM != RECORD != ENTITY
 *
 * A Module defines what data it collects, what Entities it references,
 * how its form behaves, and how its Records are identified.
 *
 * The deterministic Core provides validation, security, Form rendering,
 * Record creation, Entity reference integrity, persistence, and versioning.
 *
 * @module modules/module
 */

export const MODULE_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
});

/**
 * @typedef {Object} FormSchema
 * @property {string} schemaVersion — version of this form schema
 * @property {import('../core/data/entityType.js').FieldDefinition[]} fields — ordered field definitions
 */

/**
 * @typedef {Object} DisplayConfig
 * @property {string} [primaryField] — field key used as primary display in lists
 * @property {string[]} [listFields] — field keys shown in list views (future)
 */

/**
 * @typedef {Object} ModuleDefinition
 * @property {string} moduleId — immutable internal identifier
 * @property {string} workspaceId — immutable workspace ownership
 * @property {string} moduleCode — stable human/developer-facing code (unique within workspace)
 * @property {string} name — human-readable display name
 * @property {string} description
 * @property {string} category — organizational metadata (e.g. "Operations", "HR")
 * @property {string} status — one of MODULE_STATUSES
 * @property {number} version — integer version, incremented on schema changes
 * @property {FormSchema} formSchema — the form definition
 * @property {Object} recordConfig — how Records from this module are identified
 * @property {string} recordConfig.recordType — stable machine-readable Record type
 * @property {DisplayConfig} displayConfig — presentation metadata for future views
 * @property {string|null} primaryEntityTypeId — Entity Type this module primarily works with
 * @property {Object} createdBy — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates a Module Definition value object.
 *
 * @param {Object} params
 * @returns {ModuleDefinition}
 */
export function createModule({
  moduleId,
  workspaceId,
  moduleCode,
  name,
  description = '',
  category = '',
  status = MODULE_STATUSES.DRAFT,
  version = 1,
  formSchema = { schemaVersion: '1.0.0', fields: [] },
  recordConfig = {},
  displayConfig = {},
  primaryEntityTypeId = null,
  createdBy,
  createdAt,
  updatedAt,
}) {
  if (!moduleId) throw new Error('moduleId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!moduleCode) throw new Error('moduleCode is required');
  if (!name) throw new Error('name is required');
  if (!MODULE_STATUSES[status]) {
    throw new Error(`Invalid module status: ${status}`);
  }
  if (typeof version !== 'number' || version < 1 || !Number.isInteger(version)) {
    throw new Error('version must be a positive integer');
  }
  if (!createdBy) throw new Error('createdBy is required');

  // Derive recordType from moduleCode if not explicitly configured
  const resolvedRecordConfig = Object.freeze({
    recordType: recordConfig.recordType || moduleCode,
  });

  return Object.freeze({
    moduleId,
    workspaceId,
    moduleCode,
    name,
    description,
    category,
    status,
    version,
    formSchema: Object.freeze({
      schemaVersion: formSchema.schemaVersion || '1.0.0',
      fields: Object.freeze(
        (formSchema.fields || []).map((f) => Object.freeze({ ...f })),
      ),
    }),
    recordConfig: resolvedRecordConfig,
    displayConfig: Object.freeze({ ...displayConfig }),
    primaryEntityTypeId,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Module code pattern: uppercase letters, digits, underscores. Must start with a letter.
 */
const MODULE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Validates a module code.
 * @param {string} code
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateModuleCode(code) {
  const errors = [];
  if (!code || typeof code !== 'string') {
    errors.push('Module code is required');
  } else if (!MODULE_CODE_PATTERN.test(code)) {
    errors.push('Module code must be uppercase letters, digits, and underscores, starting with a letter');
  }
  return { valid: errors.length === 0, errors };
}
