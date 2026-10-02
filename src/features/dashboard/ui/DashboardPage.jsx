import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

const QUICK_ACTIONS = [
  ['Create Record', '/app/modules'], ['Open Module', '/app/modules'], ['Create Module', '/app/modules/new'],
  ['View Records', '/app/records'], ['View Ledger', '/app/ledger'],
];
function DashboardSection({ state, loadingMessage, emptyTitle, emptyDescription, children }) {
  if (state.loading) return <LoadingState message={loadingMessage} className="min-h-32" />;
  if (state.error) return <ErrorState message={state.error} className="p-0" />;
  if (state.items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return children(state.items);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentWorkspace, activeWorkset, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;
  const moduleLoader = useCallback(() => services.module.listModules(workspaceId), [workspaceId]);
  const recordLoader = useCallback(() => services.recordQuery.queryRecords({ workspaceId, userId, bucket: 'ALL', limit: 5 }), [workspaceId, userId]);
  const widgetLoader = useCallback(() => services.widget.listForUser(workspaceId, userId), [workspaceId, userId]);
  const moduleQuery = useWorkspaceQuery({ workspaceId, resource: 'modules', loader: moduleLoader, enabled: Boolean(workspaceId) });
  const recordQuery = useWorkspaceQuery({ workspaceId, resource: 'dashboardRecords', params: { userId, limit: 5 }, loader: recordLoader, enabled: Boolean(workspaceId && userId), ttlMs: 15000 });
  const widgetQuery = useWorkspaceQuery({ workspaceId, resource: 'widgets', params: { userId }, loader: widgetLoader, enabled: Boolean(workspaceId && userId) });
  const modules = { loading: moduleQuery.initialLoading, error: moduleQuery.error ? 'Modules could not be loaded.' : null, items: moduleQuery.data || [] };
  const records = { loading: recordQuery.initialLoading, error: recordQuery.error ? 'Recent Records could not be loaded.' : null, items: recordQuery.data?.items || [] };
  const widgets = { loading: widgetQuery.initialLoading, error: widgetQuery.error ? 'Widgets could not be loaded.' : null, items: widgetQuery.data || [] };

  if (workspaceLoading) return <PageContainer><LoadingState message="Loading workspace..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="This workspace could not be loaded." /></PageContainer>;
  const visibleModules = activeWorkset ? modules.items.filter((module) => activeWorkset.moduleIds.includes(module.moduleId)) : modules.items;
  const moduleState = { ...modules, items: visibleModules };

  return <PageContainer><PageHeader title={currentWorkspace.name || 'Personal Workspace'} description={`${currentWorkspace.type === 'PERSONAL' ? 'Personal' : 'Organization'} workspace${activeWorkset ? ` · ${activeWorkset.name}` : ''}`} />
    <section className="mb-8"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Quick actions</h2><div className="flex flex-wrap gap-2">{QUICK_ACTIONS.map(([label, to]) => <Link key={label} to={to} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-primary-300">{label}</Link>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{activeWorkset ? activeWorkset.name : 'Modules'}</h2><Link className="text-sm text-primary-700" to="/app/worksets">Worksets</Link></div><DashboardSection state={moduleState} loadingMessage="Loading Modules..." emptyTitle="No Modules" emptyDescription="Create your first Module or add Modules to this Workset.">{(items) => <div className="grid gap-3 sm:grid-cols-2">{items.slice(0, 4).map((module) => <Link key={module.moduleId} to={`/app/modules/${module.moduleId}`}><Card className="p-4 hover:border-primary-300"><h3 className="font-semibold">{module.name}</h3><p className="mt-1 text-sm text-neutral-600">{module.description}</p></Card></Link>)}</div>}</DashboardSection></section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent Records</h2><Link className="text-sm text-primary-700" to="/app/records">View all</Link></div><DashboardSection state={records} loadingMessage="Loading recent Records..." emptyTitle="No records yet" emptyDescription="Create Records using a Module to see recent activity.">{(items) => <div className="space-y-2">{items.map((record) => <Link key={record.recordId} to={`/app/records/${record.recordId}`}><Card className="mb-2 p-3"><span className="font-medium">{record.recordType}</span><span className="float-right text-xs text-neutral-500">{record.status}</span></Card></Link>)}</div>}</DashboardSection></section></div>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">My Widgets</h2><Link className="text-sm text-primary-700" to="/app/widgets">Manage</Link></div><DashboardSection state={widgets} loadingMessage="Loading Widgets..." emptyTitle="No dashboard widgets" emptyDescription="Create a widget to monitor workspace activity.">{(items) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.slice(0, 6).map((widget) => <Card key={widget.widgetId} className="p-5"><p className="text-xs font-semibold text-neutral-500">{widget.type}</p><h3 className="mt-1 font-semibold">{widget.name}</h3></Card>)}</div>}</DashboardSection></section>
  </PageContainer>;
}
