/**
 * My Modules — list all Modules in current workspace.
 */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

const STATUS_COLORS = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-yellow-100 text-yellow-800',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

export default function ModulesPage() {
  const { currentWorkspace, activeWorkset, activateWorkset, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const loader = useCallback(() => services.module.listModules(workspaceId), [workspaceId]);
  const { data: cachedModules = [], error, initialLoading: loading, refreshing } = useWorkspaceQuery({
    workspaceId, resource: 'modules', loader, enabled: Boolean(workspaceId),
  });
  const modules = activeWorkset
    ? cachedModules.filter((module) => activeWorkset.moduleIds.includes(module.moduleId))
    : cachedModules;

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

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">My Modules</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {activeWorkset ? `Modules in ${activeWorkset.name}` : 'Create and manage modules for your workspace'}
          </p>
        </div>
        <div className="flex gap-2">{activeWorkset && <button type="button" onClick={() => activateWorkset(null)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">All Modules</button>}<Link
          to="/app/modules/new"
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Create Module
        </Link></div>
      </div>

      {refreshing && <p className="mb-3 text-xs text-neutral-400">Refreshing…</p>}
      {error && <ErrorState message="Modules could not be refreshed." />}

      {modules.length === 0 ? (
        <div className="text-center py-16 bg-neutral-50 rounded-xl border border-neutral-200">
          <div className="text-4xl mb-3">&#128221;</div>
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">{activeWorkset ? 'No Modules in this Workset' : 'No modules yet'}</h2>
          <p className="text-sm text-neutral-500 mb-4">
            {activeWorkset ? 'Edit the Workset to add Modules, or return to All Modules.' : 'Modules define forms that create Records. Get started by creating your first module.'}
          </p>
          <Link
            to="/app/modules/new"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            Create Module
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {modules.map((mod) => (
            <Link
              key={mod.moduleId}
              to={`/app/modules/${mod.moduleId}/records`}
              className="block p-4 bg-white border border-neutral-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-neutral-900">{mod.name}</h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">{mod.moduleCode}</p>
                  {mod.description && (
                    <p className="text-sm text-neutral-600 mt-1">{mod.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                    {mod.category && <span>{mod.category}</span>}
                    <span>v{mod.version}</span>
                    <span>{mod.formSchema?.fields?.length || 0} fields</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[mod.status] || ''}`}>
                  {mod.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
