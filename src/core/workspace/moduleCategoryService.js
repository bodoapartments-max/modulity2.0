/**
 * Modulity 2.0 — Module Category Service (application boundary)
 *
 * Workspace-scoped CRUD over the canonical moduleCategories collection.
 * Category changes are organizational metadata — they never touch Modules,
 * Records, Ledger or ModuleVersion history.
 *
 * Rename safety: displayName may change; categoryCode is immutable.
 * Archive safety: ARCHIVED categories keep existing Module links; those
 * Modules present as a marked bucket via resolveModuleCategoryBucket().
 * Hard delete is NOT exposed — use archive.
 */
import { generateId } from '../utils/generateId.js';
import { generateTechnicalCode, resolveCodeCollision } from '../utils/technicalCode.js';
import { createModuleCategory, MODULE_CATEGORY_STATUSES } from './moduleCategory.js';
import { AppError } from '../errors/appError.js';

export function createModuleCategoryService({ moduleCategoryRepo, moduleRepo }) {
  async function listCategories(workspaceId) {
    return moduleCategoryRepo.list(workspaceId);
  }

  async function createCategory(workspaceId, { displayName, description = '', sortOrder = 0 }, actor) {
    if (!displayName?.trim()) throw new AppError('validation_error', 'Category name is required');
    const existing = await moduleCategoryRepo.list(workspaceId);
    const candidate = createModuleCategory({
      categoryId: `cat_${generateId()}`,
      workspaceId,
      displayName,
      description,
      sortOrder,
      createdBy: actor,
    });
    const usedCodes = new Set(existing.map((cat) => cat.categoryCode));
    const resolvedCode = resolveCodeCollision(generateTechnicalCode(displayName), usedCodes);
    return moduleCategoryRepo.create({ ...candidate, categoryCode: resolvedCode });
  }

  async function renameCategory(workspaceId, categoryId, { displayName, description, sortOrder }, actor) {
    const existing = await moduleCategoryRepo.getById(workspaceId, categoryId);
    if (!existing) throw new AppError('not_found', 'Category not found');
    if (displayName !== undefined && !displayName?.trim()) {
      throw new AppError('validation_error', 'Category name cannot be empty');
    }
    void actor;
    // categoryCode/categoryId/workspaceId are NEVER client-mutable here
    return moduleCategoryRepo.update(workspaceId, categoryId, {
      ...(displayName !== undefined ? { displayName: displayName.trim() } : {}),
      ...(description !== undefined ? { description: description.trim() } : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  async function archiveCategory(workspaceId, categoryId) {
    const existing = await moduleCategoryRepo.getById(workspaceId, categoryId);
    if (!existing) throw new AppError('not_found', 'Category not found');
    return moduleCategoryRepo.update(workspaceId, categoryId, {
      status: MODULE_CATEGORY_STATUSES.ARCHIVED,
      updatedAt: new Date().toISOString(),
    });
  }

  async function unarchiveCategory(workspaceId, categoryId) {
    const existing = await moduleCategoryRepo.getById(workspaceId, categoryId);
    if (!existing) throw new AppError('not_found', 'Category not found');
    return moduleCategoryRepo.update(workspaceId, categoryId, {
      status: MODULE_CATEGORY_STATUSES.ACTIVE,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Ensures a category exists for a display name; used by Automat apply. */
  async function ensureCategoryByDisplayName(workspaceId, displayName, actor) {
    const trimmed = String(displayName || '').trim();
    if (!trimmed) return null;
    const existing = await moduleCategoryRepo.list(workspaceId);
    const found = existing.find((cat) => cat.displayName.toLowerCase() === trimmed.toLowerCase());
    if (found) return found;
    return createCategory(workspaceId, { displayName: trimmed }, actor);
  }

  void moduleRepo; // reserved for future admin surfaces (category usage counts)

  return {
    listCategories,
    createCategory,
    renameCategory,
    archiveCategory,
    unarchiveCategory,
    ensureCategoryByDisplayName,
  };
}
