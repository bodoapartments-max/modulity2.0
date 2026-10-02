import { useEffect, useState } from 'react';
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

const QUICK_ACTIONS = [
  ['Create Record', '/app/modules'], ['Open Module', '/app/modules'], ['Create Module', '/app/modules/new'],
  ['View Records', '/app/records'], ['View Ledger', '/app/ledger'],
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentWorkspace, activeWorkset, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [state, setState] = useState({ loading: true, error: null, modules: [], records: [], widgets: [] });
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !userId) { setState({ loading: false, error: null, modules: [], records: [], widgets: [] }); return undefined; }
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.all([
      services.module.listModules(workspaceId),
      services.recordQuery.queryRecords({ workspaceId, userId, bucket: 'ALL', limit: 5 }),
      services.widget.listForUser(workspaceId, userId),
    ]).then(([modules, records, widgets]) => { if (!cancelled) setState({ loading: false, error: null, modules, records: records.items || [], widgets }); }).catch(() => { if (!cancelled) setState({ loading: false, error: 'Workspace activity could not be loaded.', modules: [], records: [], widgets: [] }); });
    return () => { cancelled = true; };
  }, [workspaceId, userId]);
  if (workspaceLoading || state.loading) return <PageContainer><LoadingState message="Loading workspace..." /></PageContainer>;
  if (workspaceError || state.error || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message={state.error || 'This workspace could not be loaded.'} /></PageContainer>;
  const visibleModules = activeWorkset ? state.modules.filter((module) => activeWorkset.moduleIds.includes(module.moduleId)) : state.modules;
  return <PageContainer><PageHeader title={currentWorkspace.name || 'Personal Workspace'} description={`${currentWorkspace.type === 'PERSONAL' ? 'Personal' : 'Organization'} workspace${activeWorkset ? ` · ${activeWorkset.name}` : ''}`} />
    <section className="mb-8"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Quick actions</h2><div className="flex flex-wrap gap-2">{QUICK_ACTIONS.map(([label, to]) => <Link key={label} to={to} className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:border-primary-300">{label}</Link>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{activeWorkset ? activeWorkset.name : 'Modules'}</h2><Link className="text-sm text-primary-700" to="/app/worksets">Worksets</Link></div>{visibleModules.length === 0 ? <EmptyState title="No Modules" description="Create your first Module or add Modules to this Workset." /> : <div className="grid gap-3 sm:grid-cols-2">{visibleModules.slice(0, 4).map((module) => <Link key={module.moduleId} to={`/app/modules/${module.moduleId}`}><Card className="p-4 hover:border-primary-300"><h3 className="font-semibold">{module.name}</h3><p className="mt-1 text-sm text-neutral-600">{module.description}</p></Card></Link>)}</div>}</section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent Records</h2><Link className="text-sm text-primary-700" to="/app/records">View all</Link></div>{state.records.length === 0 ? <EmptyState title="No records yet" description="Create Records using a Module to see recent activity." /> : <div className="space-y-2">{state.records.map((record) => <Link key={record.recordId} to={`/app/records/${record.recordId}`}><Card className="mb-2 p-3"><span className="font-medium">{record.recordType}</span><span className="float-right text-xs text-neutral-500">{record.status}</span></Card></Link>)}</div>}</section></div>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">My Widgets</h2><Link className="text-sm text-primary-700" to="/app/widgets">Manage</Link></div>{state.widgets.length === 0 ? <EmptyState title="No dashboard widgets" description="Create a widget to monitor workspace activity." /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{state.widgets.slice(0, 6).map((widget) => <Card key={widget.widgetId} className="p-5"><p className="text-xs font-semibold text-neutral-500">{widget.type}</p><h3 className="mt-1 font-semibold">{widget.name}</h3></Card>)}</div>}</section>
  </PageContainer>;
}
