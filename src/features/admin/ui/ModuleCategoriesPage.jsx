/**
 * Module Categories — manage canonical Module Categories.
 *
 * Category identity stays stable under rename; archive preserves Module links;
 * delete requires zero dependencies. All mutations go through the trusted
 * administration boundary (adminCommand).
 */
import { useCallback, useMemo, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { userActor } from '../../../core/data/actorRef.js';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import { Dialog, Input, useToast } from '../../../design-system/index.js';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
import AdminActions from '../../admin/ui/AdminActions.jsx';

export default function ModuleCategoriesPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loader = useCallback(
    async () => {
      const [categories, modules] = await Promise.all([
        services.moduleCategory.listCategories(workspaceId),
        services.module.listModules(workspaceId),
      ]);
      const usageCount = new Map();
      for (const mod of modules) {
        if (mod.categoryId) usageCount.set(mod.categoryId, (usageCount.get(mod.categoryId) || 0) + 1);
      }
      return categories.map((cat) => ({ ...cat, moduleCount: usageCount.get(cat.categoryId) || 0 }));
    },
    [workspaceId],
  );
  const query = useWorkspaceQuery({ workspaceId, resource: 'moduleCategoriesAdmin', loader, enabled: Boolean(workspaceId) });

  const categories = useMemo(
    () => [...(query.data || [])].sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName)),
    [query.data],
  );

  async function withBusy(categoryId, action, successMessage) {
    setBusyId(categoryId);
    try {
      await action();
      showToast({ message: successMessage, variant: 'success' });
      await query.refresh();
    } catch (err) {
      showToast({ message: err.message || 'Action failed', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Module Categories"
        description="One canonical taxonomy shared by manual and Automat-generated Modules."
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            New Category
          </button>
        }
      />

      {query.initialLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {query.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error.message}</div>}

      {!query.initialLoading && categories.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-10 text-center">
          <h2 className="text-base font-semibold text-neutral-700">No categories yet</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Modules stay fully usable without categories. Add one when the workspace needs them.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {categories.map((cat) => (
          <li key={cat.categoryId}>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-neutral-900">{cat.displayName}</p>
                  <p className="mt-0.5 text-xs font-mono text-neutral-400">{cat.categoryCode}</p>
                  {cat.description && <p className="mt-1 text-sm text-neutral-600">{cat.description}</p>}
                  <p className="mt-1 text-xs text-neutral-500">
                    {cat.moduleCount} module{cat.moduleCount === 1 ? '' : 's'} · created {cat.createdAt?.slice(0, 10) || '—'}
                  </p>
                </div>
                <Badge variant={cat.status === 'ACTIVE' ? 'success' : 'neutral'}>{cat.status}</Badge>
              </div>
              <div className="mt-3">
                <AdminActions
                  resourceLabel={`Category "${cat.displayName}"`}
                  status={cat.status}
                  busy={busyId === cat.categoryId}
                  onRename={(next) => withBusy(cat.categoryId, () => services.moduleCategory.renameCategory(workspaceId, cat.categoryId, { displayName: next }, userActor(user?.userId)), 'Renamed')}
                  onArchive={() => withBusy(cat.categoryId, () => services.moduleCategory.archiveCategory(workspaceId, cat.categoryId), 'Archived')}
                  onRestore={() => withBusy(cat.categoryId, () => services.moduleCategory.unarchiveCategory(workspaceId, cat.categoryId), 'Restored')}
                  onDelete={() => withBusy(cat.categoryId, () => services.moduleCategory.deleteCategory(workspaceId, cat.categoryId), 'Deleted')}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={creating} onClose={() => setCreating(false)} title="New Module Category">
        <Input
          id="new-category-name"
          label="Display name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Human Resources"
        />
        <p className="mt-1 text-xs text-neutral-500">Technical code is generated automatically.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="text-sm text-neutral-600" onClick={() => setCreating(false)}>Cancel</button>
          <button
            type="button"
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!newName.trim() || !workspaceId || !user?.userId}
            onClick={async () => {
              await withBusy('create', async () => {
                await services.moduleCategory.createCategory(workspaceId, { displayName: newName.trim() }, userActor(user?.userId));
                setNewName('');
                setCreating(false);
              }, 'Category created');
            }}
          >
            Create
          </button>
        </div>
      </Dialog>
    </PageContainer>
  );
}
