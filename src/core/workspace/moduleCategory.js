/**
 * Modulity 2.0 — Module Category (canonical organizational model)
 *
 * ONE canonical category source shared by manual and Automat-generated
 * Modules. A Category is organizational metadata — it is deliberately NOT
 * authorization and NOT personal visibility (three separate concepts).
 *
 * Identity discipline (see ADR-0012):
 *   categoryId  — internal stable id (cat_...)
 *   categoryCode — UPPER_SNAKE technical code, unique per workspace,
 *                  generated from displayName at creation, immutable
 *   displayName — human label; renaming NEVER renames categoryCode
 *
 * @module core/workspace/moduleCategory
 */

import { generateTechnicalCode } from '../utils/technicalCode.js';

export const MODULE_CATEGORY_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
});

/** Derived/system fallback id shown for Modules without a canonical category. */
export const UNCATEGORIZED_ID = 'UNCATEGORIZED';

export const UNCATEGORIZED_LABEL = 'Uncategorized';

/**
 * @typedef {Object} ModuleCategory
 * @property {string} categoryId
 * @property {string} workspaceId
 * @property {string} displayName
 * @property {string} categoryCode — stable technical code, UPPER_SNAKE
 * @property {string} description
 * @property {string} status — ACTIVE | ARCHIVED
 * @property {number} sortOrder
 * @property {Object} createdBy — ActorRef
 * @property {Object|null} createdByKind — 'USER' or 'AUTOMAT' provenance hint
 */

export function createModuleCategory({
  categoryId,
  workspaceId,
  displayName,
  categoryCode = null,
  description = '',
  status = MODULE_CATEGORY_STATUSES.ACTIVE,
  sortOrder = 0,
  createdBy,
  createdAt,
  updatedAt,
}) {
  if (!categoryId) throw new Error('categoryId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!displayName?.trim()) throw new Error('displayName is required');
  if (!MODULE_CATEGORY_STATUSES[status]) throw new Error(`Invalid category status: ${status}`);
  if (!createdBy) throw new Error('createdBy is required');
  const resolvedCode = categoryCode || generateTechnicalCode(displayName);
  return Object.freeze({
    categoryId,
    workspaceId,
    displayName: displayName.trim(),
    categoryCode: resolvedCode,
    description: description.trim(),
    status,
    sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Resolves the presentational bucket of a Module.
 * @param {Object|null} mod — Module definition (categoryId may be null/absent)
 * @param {ModuleCategory[]} categories — canonical categories of the workspace
 * @returns {{ categoryId: string, displayName: string, isUncategorized: boolean, archived: boolean }}
 */
export function resolveModuleCategoryBucket(mod, categories = []) {
  const found = categories.find((cat) => cat.categoryId === mod?.categoryId);
  if (!found) {
    const legacy = mod?.category?.trim();
    if (legacy) {
      // Legacy free-text labels keep their own bucket so they don't collapse
      // into the UNCATEGORIZED group of genuinely ungrouped Modules.
      return { categoryId: `LEGACY::${legacy.toUpperCase()}`, displayName: legacy, isUncategorized: false, archived: false };
    }
    return { categoryId: UNCATEGORIZED_ID, displayName: UNCATEGORIZED_LABEL, isUncategorized: true, archived: false };
  }
  if (found.status === MODULE_CATEGORY_STATUSES.ARCHIVED) {
    // Archived categories never orphan Modules: present their Modules as
    // Uncategorized while the archived category remains the canonical link.
    return { categoryId: UNCATEGORIZED_ID, displayName: `${found.displayName} (archived)`, isUncategorized: false, archived: true };
  }
  return { categoryId: found.categoryId, displayName: found.displayName, isUncategorized: false, archived: false };
}
