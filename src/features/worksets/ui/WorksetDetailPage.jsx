import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

export default function WorksetDetailPage() {
  const { worksetId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace, activeWorkset, activateWorkset } = useWorkspace();
  const [workset, setWorkset] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!currentWorkspace?.workspaceId) { setLoading(false); return undefined; }
    Promise.all([services.workset.get(currentWorkspace.workspaceId, worksetId), services.module.listModules(currentWorkspace.workspaceId)]).then(([nextWorkset, allModules]) => { if (!cancelled) { setWorkset(nextWorkset); setModules(allModules.filter((module) => nextWorkset?.moduleIds.includes(module.moduleId))); } }).catch(() => { if (!cancelled) setError('Workset could not be loaded.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentWorkspace?.workspaceId, worksetId]);
  if (loading) return <PageContainer><LoadingState /></PageContainer>;
  if (error || !workset) return <PageContainer><ErrorState message={error || 'Workset not found.'} /></PageContainer>;
  return <PageContainer><PageHeader title={workset.name} description={workset.description || 'Work context'} action={<div className="flex gap-2"><Button variant="outline" onClick={() => activateWorkset(activeWorkset?.worksetId === worksetId ? null : worksetId)}>{activeWorkset?.worksetId === worksetId ? 'Leave Workset' : 'Activate'}</Button><Button variant="danger" onClick={async () => { await services.workset.archive(currentWorkspace.workspaceId, worksetId); workspaceQueryCache.invalidate(`${currentWorkspace.workspaceId}:worksets:`); navigate('/app/worksets'); }}>Archive</Button></div>} />
    <div className="grid gap-4 sm:grid-cols-2">{modules.map((module) => <Link key={module.moduleId} to={`/app/modules/${module.moduleId}`}><Card className="p-4 hover:border-primary-300"><h2 className="font-semibold">{module.name}</h2><p className="mt-1 text-sm text-neutral-600">{module.description}</p></Card></Link>)}</div>
  </PageContainer>;
}
