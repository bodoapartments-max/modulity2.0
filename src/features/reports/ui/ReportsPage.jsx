import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

export default function ReportsPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const loader = useCallback(() => services.report.list(workspaceId), [workspaceId]);
  const { data: reports = [], error, initialLoading, refreshing, refresh } = useWorkspaceQuery({ workspaceId, resource: 'reports', loader, enabled: Boolean(workspaceId) });
  if (workspaceLoading || initialLoading) return <PageContainer><LoadingState message="Loading Reports..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select a Workspace before viewing Reports." /></PageContainer>;
  return <PageContainer><PageHeader title="Reports" description="Deterministic projections over canonical workspace data." action={<Link to="/app/reports/new"><Button>Create Report</Button></Link>} />{refreshing && <p className="mb-3 text-xs text-neutral-400">Refreshing…</p>}{error && reports.length === 0 ? <ErrorState message="Reports could not be loaded." retry={refresh} /> : reports.length === 0 ? <EmptyState title="No Reports yet" description="Create a Report definition to project and aggregate canonical Records."><Link to="/app/reports/new"><Button>Create Report</Button></Link></EmptyState> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{reports.map((report) => <Link key={report.reportId} to={`/app/reports/${report.reportId}`}><Card className="h-full p-4 hover:border-primary-300"><h2 className="font-semibold">{report.name}</h2><p className="mt-1 text-sm text-neutral-600">{report.description || 'No description'}</p><p className="mt-3 text-xs text-neutral-500">{report.dataSources.length} source{report.dataSources.length === 1 ? '' : 's'} · v{report.version}</p></Card></Link>)}</div>}</PageContainer>;
}
