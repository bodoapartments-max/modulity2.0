/**
 * My Modules — presentation model (pure).
 *
 * My Modules = the user's PERSONALIZED working set of authorized Modules.
 * All Modules = the authorized discovery surface.
 *
 * Selected-but-hidden Modules remain authorized and remain discoverable via
 * All Modules. Preferences never copy Module data — ids only.
 */
import { resolveModuleCategoryBucket, UNCATEGORIZED_ID } from '../../core/workspace/moduleCategory.js';
import { MODULE_PREFERENCE_VIEW_MODES } from '../../core/workspace/workspaceExperienceServices.js';

/**
 * @param {Array} modules — authorized modules (canonical)
 * @param {Array} categories — canonical moduleCategories
 * @param {Object|null} prefs — { selectedModuleIds, moduleOrder, viewMode }
 * @param {Object} filters — { search, categoryId }
 * @returns {{ groups: Array<{ categoryId, displayName, archived, modules: Array }>, flat: Array, uncategorizedCount: number }}
 */
export function buildModulePresentation(modules, categories, prefs, filters = {}) {
  const search = (filters.search || '').trim().toLowerCase();
  const categoryId = filters.categoryId || null;
  const selected = new Set(prefs?.selectedModuleIds || []);
  const order = prefs?.moduleOrder || [];

  const visible = modules.filter((mod) => {
    if (selected.size && !selected.has(mod.moduleId)) return false;
    if (search && !`${mod.name} ${mod.moduleCode} ${mod.description || ''}`.toLowerCase().includes(search)) return false;
    const bucket = resolveModuleCategoryBucket(mod, categories);
    if (categoryId && bucket.categoryId !== categoryId) return false;
    return true;
  });

  const orderIndex = new Map(order.map((id, idx) => [id, idx]));
  const byOrder = (a, b) => (orderIndex.get(a.moduleId) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.moduleId) ?? Number.MAX_SAFE_INTEGER)
    || a.name.localeCompare(b.name);
  const sorted = [...visible].sort(byOrder);

  const groups = [];
  const groupByCat = new Map();
  for (const mod of sorted) {
    const bucket = resolveModuleCategoryBucket(mod, categories);
    if (!groupByCat.has(bucket.categoryId)) {
      const cat = categories.find((c) => c.categoryId === bucket.categoryId);
      const entry = { categoryId: bucket.categoryId, displayName: bucket.displayName, archived: bucket.archived, sortOrder: cat?.sortOrder ?? 0, modules: [] };
      groupByCat.set(bucket.categoryId, entry);
      groups.push(entry);
    }
    groupByCat.get(bucket.categoryId).modules.push(mod);
  }
  groups.sort((a, b) => (a.categoryId === UNCATEGORIZED_ID) - (b.categoryId === UNCATEGORIZED_ID) || a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));

  return {
    groups,
    flat: sorted,
    uncategorizedCount: groupByCat.get(UNCATEGORIZED_ID)?.modules.length || 0,
  };
}

/**
 * Modules eligible for selection: all authorized. Excludes ARCHIVED modules
 * from selection (they're historical, not operational) but they remain
 * authorized/readable.
 */
export function selectableModules(modules) {
  return modules.filter((mod) => mod.status !== 'ARCHIVED');
}

export { MODULE_PREFERENCE_VIEW_MODES };
