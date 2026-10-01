/**
 * Modulity 2.0 — Module Version Snapshot
 *
 * An immutable historical snapshot of a Module at a specific version.
 * Once created, a Module Version MUST NEVER be modified or deleted.
 *
 * Path: workspaces/{workspaceId}/modules/{moduleId}/versions/{version}
 *
 * INVARIANT: A historical Record must always be interpretable using the exact
 * Module Version that created it. Changing a Module tomorrow must never change
 * the meaning of a Record created yesterday.
 *
 * @module modules/moduleVersion
 */

/**
 * @typedef {Object} ModuleVersionSnapshot
 * @property {string} moduleId
 * @property {string} workspaceId
 * @property {number} version           — the version number (document ID = String(version))
 * @property {string} moduleCode        — stable identity code
 * @property {string} name              — display name at time of version creation
 * @property {import('./module.js').FormSchema} formSchema — the exact schema for this version
 * @property {Object} recordConfig      — how Records are identified
 * @property {Object} displayConfig     — presentation metadata
 * @property {string|null} primaryEntityTypeId
 * @property {Object} createdBy         — ActorRef who activated/versioned this snapshot
 * @property {string} createdAt         — when this version snapshot was created
 */

/**
 * Creates an immutable Module Version snapshot value object.
 *
 * @param {Object} params
 * @returns {ModuleVersionSnapshot}
 */
export function createModuleVersionSnapshot({
  moduleId,
  workspaceId,
  version,
  moduleCode,
  name,
  formSchema,
  recordConfig = {},
  displayConfig = {},
  primaryEntityTypeId = null,
  createdBy,
  createdAt,
}) {
  if (!moduleId) throw new Error('moduleId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('version must be a positive integer');
  }
  if (!moduleCode) throw new Error('moduleCode is required');
  if (!name) throw new Error('name is required');
  if (!formSchema || !formSchema.fields || formSchema.fields.length === 0) {
    throw new Error('formSchema with at least one field is required');
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    moduleId,
    workspaceId,
    version,
    moduleCode,
    name,
    formSchema: Object.freeze({
      schemaVersion: formSchema.schemaVersion || '1.0.0',
      fields: Object.freeze(
        (formSchema.fields || []).map((f) => Object.freeze({ ...f })),
      ),
    }),
    recordConfig: Object.freeze({ ...recordConfig }),
    displayConfig: Object.freeze({ ...displayConfig }),
    primaryEntityTypeId,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
  });
}
