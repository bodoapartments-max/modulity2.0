/**
 * My Modules — personalized working set of authorized Modules (Step 17.2).
 *
 * Key separations (ADR-0012):
 * - CATEGORY = organizational grouping (canonical moduleCategories)
 * - AUTHORIZATION = membership/permission (enforced by server rules)
 * - PERSONAL SELECTION = user preference stored in userWorkspacePreferences
 *
 * Preferences are user+workspace scoped and persisted server-side so they
 * survive reloads and any future mobile/API client.
 */
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
import { Select } from '../../../design-system/index.js';
import { buildModulePresentation, MODULE_PREFERENCE_VIEW_MODES } from '../model.js';
import { resolveModuleCategoryBucket, UNCATEGORIZED_ID, UNCATEGORIZED_LABEL } from '../../../core/workspace/moduleCategory.js';

const STATUS_COLORS = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-yellow-100 text-yellow-800',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

function ModuleCard({ mod, bucket }) {
  return (
    <Link
      to={`/app/modules/${mod.moduleId}/records`}
      className="block p-4 bg-white border border-neutral-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-neutral-900">{mod.name}</h3>
          {mod.description && <p className="text-sm text-neutral-600 mt-1">{mod.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
            {bucket && <span>{bucket.displayName}</span>}
            <span>v{mod.version}</span>
            <span>{mod.formSchema?.fields?.length || 0} fields</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[mod.status] || ''}`}>
          {mod.status}
        </span>
      </div>
    </Link>
  );
}

function CustomizePanel({ modules, prefs, onChange, onClose }) {
  const selected = new Set(prefs.selectedModuleIds || []);
  const order = prefs.moduleOrder || [];
  const orderedIds = [...order.filter((id) => modules.some((m) => m.moduleId === id)), ...modules.map((m) => m.moduleId).filter((id) => !order.includes(id))];

  function toggle(id) {
    // When nothing is stored, EVERY authorized Module is implicitly selected.
    // The first toggle materializes that implicit selection so unchecking
    // actually removes the module.
    const next = selected.size === 0
      ? new Set(modules.map((m) => m.moduleId))
      : new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ selectedModuleIds: [...next] });
  }
  function move(id, dir) {
    const idx = orderedIds.indexOf(id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ moduleOrder: next });
  }

  return (
    <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4" role="group" aria-label="Customize My Modules">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-800">Customize My Modules</h2>
        <button type="button" onClick={onClose} className="text-sm text-primary-600 hover:underline">Done</button>
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        Select which authorized Modules appear here and in what order. Hidden Modules stay
        authorized and remain discoverable in All Modules. Nothing here changes permissions.
      </p>
      <ul className="divide-y divide-neutral-200 bg-white rounded-lg border border-neutral-200">
        {orderedIds.map((id, idx) => {
          const mod = modules.find((m) => m.moduleId === id);
          if (!mod) return null;
          return (
            <li key={id} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                id={`sel-${id}`}
                checked={selected.size === 0 ? true : selected.has(id)}
                onChange={() => toggle(id)}
                aria-label={`Select ${mod.name}`}
                className="h-4 w-4 rounded border-neutral-300 text-primary-600"
              />
              <label htmlFor={`sel-${id}`} className="flex-1 text-sm text-neutral-800">{mod.name}</label>
              <div className="flex gap-1">
                <button type="button" aria-label={`Move ${mod.name} up`} disabled={idx === 0} onClick={() => move(id, -1)} className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Move ${mod.name} down`} disabled={idx === orderedIds.length - 1} onClick={() => move(id, 1)} className="rounded border border-neutral-300 px-2 py-0.5 text-xs disabled:opacity-30">↓</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ModulesPage() {
  const { currentWorkspace, activeWorkset, activateWorkset, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.uid || user?.userId;
  const workspaceId = currentWorkspace?.workspaceId;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [customizing, setCustomizing] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const moduleLoader = useCallback(() => services.module.listModules(workspaceId), [workspaceId]);
  const { data: cachedModules = [], error, initialLoading: loading, refreshing } = useWorkspaceQuery({
    workspaceId, resource: 'modules', loader: moduleLoader, enabled: Boolean(workspaceId),
  });

  const categoryLoader = useCallback(() => services.moduleCategory?.listCategories(workspaceId) ?? Promise.resolve([]), [workspaceId]);
  const { data: categories = [] } = useWorkspaceQuery({
    workspaceId, resource: 'moduleCategories', loader: categoryLoader, enabled: Boolean(workspaceId),
  });

  const prefLoader = useCallback(async () => {
    if (!userId) return null;
    return services.workspacePreference?.getModuleSelection?.(workspaceId, userId) ?? null;
  }, [workspaceId, userId]);
  const { data: storedPrefs } = useWorkspaceQuery({
    workspaceId, resource: `modulePrefs:${userId}`, loader: prefLoader, enabled: Boolean(workspaceId && userId),
  });

  const effectivePrefs = useMemo(() => ({
    selectedModuleIds: prefs?.selectedModuleIds ?? storedPrefs?.selectedModuleIds ?? [],
    moduleOrder: prefs?.moduleOrder ?? storedPrefs?.moduleOrder ?? [],
    viewMode: prefs?.viewMode ?? storedPrefs?.viewMode ?? MODULE_PREFERENCE_VIEW_MODES.GROUPED,
    collapsedCategoryIds: prefs?.collapsedCategoryIds ?? storedPrefs?.collapsedCategoryIds ?? [],
  }), [prefs, storedPrefs]);

  const modules = useMemo(() => (
    activeWorkset ? cachedModules.filter((mod) => activeWorkset.moduleIds.includes(mod.moduleId)) : cachedModules
  ), [cachedModules, activeWorkset]);

  const savePrefs = useCallback(async (partial) => {
    const next = { ...effectivePrefs, ...partial };
    setPrefs(next);
    setSaveError(null);
    try {
      await services.workspacePreference?.setModuleSelection?.(workspaceId, userId, next);
    } catch (err) {
      setSaveError(err.message || 'Preferences could not be saved.');
    }
  }, [effectivePrefs, workspaceId, userId]);

  const presentation = useMemo(
    () => buildModulePresentation(modules, categories, effectivePrefs, { search, categoryId: categoryFilter }),
    [modules, categories, effectivePrefs, search, categoryFilter],
  );

  if (!workspaceLoading && (workspaceError || !currentWorkspace)) {
    return <ErrorState title="Workspace unavailable" message="Select an available workspace before managing Modules." />;
  }
  if (workspaceLoading || loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-64 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  const hasPrefsSelection = (effectivePrefs.selectedModuleIds || []).length > 0;

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">My Modules</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {activeWorkset ? `Modules in ${activeWorkset.name}` : hasPrefsSelection ? 'Your personalized selection' : 'All authorized Modules (no personal selection yet)'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeWorkset && (
            <button type="button" onClick={() => activateWorkset(null)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              All Modules
            </button>
          )}
          <button
            type="button"
            onClick={() => setCustomizing((v) => !v)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Customize
          </button>
          <Link
            to="/app/modules/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Create Module
          </Link>
        </div>
      </div>

      {refreshing && <p className="mb-3 text-xs text-neutral-400">Refreshing…</p>}
      {error && <ErrorState message="Modules could not be refreshed." />}
      {saveError && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>}

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search modules…"
          aria-label="Search modules"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <Select
          options={[
            { value: '', label: 'All categories' },
            ...categories.filter((c) => c.status === 'ACTIVE').map((c) => ({ value: c.categoryId, label: c.displayName })),
            { value: UNCATEGORIZED_ID, label: UNCATEGORIZED_LABEL },
          ]}
          value={categoryFilter || ''}
          onChange={(e) => setCategoryFilter(e.target.value || null)}
          aria-label="Filter by category"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => savePrefs({ viewMode: effectivePrefs.viewMode === MODULE_PREFERENCE_VIEW_MODES.GROUPED ? MODULE_PREFERENCE_VIEW_MODES.FLAT : MODULE_PREFERENCE_VIEW_MODES.GROUPED })}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            aria-pressed={effectivePrefs.viewMode === MODULE_PREFERENCE_VIEW_MODES.GROUPED}
          >
            {effectivePrefs.viewMode === MODULE_PREFERENCE_VIEW_MODES.GROUPED ? 'Group by category' : 'Flat list'}
          </button>
        </div>
      </div>

      {customizing && (
        <CustomizePanel modules={modules} prefs={effectivePrefs} onChange={savePrefs} onClose={() => setCustomizing(false)} />
      )}

      {presentation.flat.length === 0 ? (
        <div className="text-center py-16 bg-neutral-50 rounded-xl border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">
            {modules.length === 0 ? 'No modules yet' : hasPrefsSelection || search || categoryFilter ? 'No modules match the current filters' : 'Nothing selected for your personal view'}
          </h2>
          <p className="text-sm text-neutral-500 mb-4">
            {modules.length === 0
              ? 'Modules define forms that create Records. Get started by creating your first module.'
              : 'Use Customize to pick which authorized Modules appear here, or clear the filters.'}
          </p>
          <Link
            to="/app/modules/new"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            Create Module
          </Link>
        </div>
      ) : effectivePrefs.viewMode === MODULE_PREFERENCE_VIEW_MODES.GROUPED ? (
        <div className="space-y-6">
          {presentation.groups.map((group) => (
            <section key={group.categoryId} aria-labelledby={`group-${group.categoryId}`}>
              <h2 id={`group-${group.categoryId}`} className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                {group.displayName}{group.archived ? ' (archived)' : ''}
              </h2>
              <div className="grid gap-4">
                {group.modules.map((mod) => (
                  <ModuleCard key={mod.moduleId} mod={mod} bucket={resolveModuleCategoryBucket(mod, categories)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {presentation.flat.map((mod) => (
            <ModuleCard key={mod.moduleId} mod={mod} bucket={resolveModuleCategoryBucket(mod, categories)} />
          ))}
        </div>
      )}
    </div>
  );
}
