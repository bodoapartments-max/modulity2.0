/**
 * Administration History — canonical Audit presented for authorized members.
 *
 * Reads bounded, workspace-scoped, permission-governed by Firestore Rules
 * already in place for auditEntries. Never a second history system.
 */
import { useCallback, useMemo, useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { Select } from '../../../design-system/index.js';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
import {
  ADMIN_RESOURCE_TYPES,
  describeAdminAction,
  describeBeforeAfter,
  filterAdminHistory,
} from '../model.js';

export default function AdminHistoryPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const [resourceFilter, setResourceFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  const loader = useCallback(
    () => services.audit.queryAudit(workspaceId, { limit: 100 }),
    [workspaceId],
  );
  const { data, loading, error } = useWorkspaceQuery({
    workspaceId,
    resource: 'adminHistory',
    loader,
    enabled: Boolean(workspaceId),
  });

  const rows = useMemo(() => filterAdminHistory(data?.items || [], {
    resourceType: resourceFilter || null,
    action: actionFilter || null,
  }), [data, resourceFilter, actionFilter]);

  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);

  if (!workspaceId) return <PageContainer><PageHeader title="Administration History" description="Loading workspace…" /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title="Administration History"
        description="Who changed protected configuration, when, and what changed — canonical Audit only."
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          label="Resource"
          options={[{ value: '', label: 'All resources' }, ...ADMIN_RESOURCE_TYPES.map((rt) => ({ value: rt, label: rt }))]}
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
        />
        <Select
          label="Action"
          options={[{ value: '', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: describeAdminAction({ action: a }) }))]}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-neutral-500">Loading…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          No administrative changes yet.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((entry) => (
          <li key={entry.auditEntryId}>
            <button
              type="button"
              onClick={() => setExpanded(expanded === entry.auditEntryId ? null : entry.auditEntryId)}
              className="w-full rounded-xl border border-neutral-200 bg-white p-4 text-left hover:border-primary-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{describeAdminAction(entry)}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {entry.actor?.actorId} · {new Date(entry.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{entry.resourceType}</span>
              </div>
              {expanded === entry.auditEntryId && (
                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-neutral-500">Resource</dt>
                    <dd className="font-mono text-neutral-700">{entry.resourceId}</dd>
                    <dt className="text-neutral-500">Operation</dt>
                    <dd className="font-mono text-neutral-700">{entry.metadata?.operationId || '—'}</dd>
                  </dl>
                  {describeBeforeAfter(entry).length > 0 && (
                    <div className="mt-2 rounded-lg bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
                      {describeBeforeAfter(entry).map((line) => <p key={line}>{line}</p>)}
                    </div>
                  )}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-400">Showing the most recent {rows.length} administrative changes.</p>
    </PageContainer>
  );
}
