import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';

export default function WorksetsPage() {
  const { currentWorkspace, activeWorkset, activateWorkset } = useWorkspace();
  const [worksets, setWorksets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    if (!currentWorkspace?.workspaceId) { setLoading(false); return; }
    try { setLoading(true); setError(null); setWorksets(await services.workset.list(currentWorkspace.workspaceId)); }
    catch { setError('Worksets could not be loaded.'); }
    finally { setLoading(false); }
  }, [currentWorkspace?.workspaceId]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <PageContainer><LoadingState message="Loading worksets..." /></PageContainer>;
  return <PageContainer>
    <PageHeader title="Worksets" description="Group Modules for a job or work context. Worksets do not grant access." action={<Link to="/app/worksets/new"><Button>Create Workset</Button></Link>} />
    {error ? <ErrorState message={error} retry={load} /> : worksets.length === 0 ? <EmptyState title="No worksets yet" description="Create a workset to group modules for a specific job."><Link to="/app/worksets/new"><Button>Create Workset</Button></Link></EmptyState> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{worksets.map((workset) => <Card key={workset.worksetId} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><Link className="font-semibold text-neutral-900 hover:text-primary-700" to={`/app/worksets/${workset.worksetId}`}>{workset.name}</Link><p className="mt-1 text-sm text-neutral-600">{workset.description || 'No description'}</p><p className="mt-3 text-xs text-neutral-500">{workset.moduleIds.length} Modules</p></div>
        <Button size="sm" variant={activeWorkset?.worksetId === workset.worksetId ? 'outline' : 'primary'} onClick={() => activateWorkset(activeWorkset?.worksetId === workset.worksetId ? null : workset.worksetId)}>{activeWorkset?.worksetId === workset.worksetId ? 'Active' : 'Activate'}</Button></div>
      </Card>)}</div>}
  </PageContainer>;
}
