import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

export default function WorksetDetailPage() {
  const { worksetId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace, activeWorkset, activateWorkset, refreshWorksets } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const [workset, setWorkset] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [moduleIds, setModuleIds] = useState([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const moduleLoader = useCallback(() => services.module.listModules(workspaceId), [workspaceId]);
  const { data: allModules = [], initialLoading: modulesLoading } = useWorkspaceQuery({ workspaceId, resource: 'modules', loader: moduleLoader, enabled: Boolean(workspaceId) });

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const next = await services.workset.get(workspaceId, worksetId);
      setWorkset(next);
      setName(next?.name || '');
      setDescription(next?.description || '');
      setModuleIds(next?.moduleIds || []);
    } catch {
      setError('Workset could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, worksetId]);
  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    try {
      const updated = await services.workset.update(workspaceId, worksetId, { name, description, moduleIds });
      setWorkset(updated);
      workspaceQueryCache.invalidate(`${workspaceId}:worksets:`);
      await refreshWorksets();
      setEditing(false);
    } catch {
      setError('Workset could not be updated.');
    }
  }

  if (loading || modulesLoading) return <PageContainer><LoadingState /></PageContainer>;
  if (error || !workset) return <PageContainer><ErrorState message={error || 'Workset not found.'} retry={load} /></PageContainer>;
  const modules = allModules.filter((module) => moduleIds.includes(module.moduleId));
  const unavailableIds = moduleIds.filter((id) => !allModules.some((module) => module.moduleId === id && module.status !== 'ARCHIVED'));

  return <PageContainer><PageHeader title={workset.name} description={workset.description || 'Work context'} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => activateWorkset(activeWorkset?.worksetId === worksetId ? null : worksetId)}>{activeWorkset?.worksetId === worksetId ? 'Leave Workset' : 'Activate'}</Button><Button variant="outline" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel Edit' : 'Edit'}</Button><Button variant="danger" onClick={async () => { await services.workset.archive(workspaceId, worksetId); workspaceQueryCache.invalidate(`${workspaceId}:worksets:`); await refreshWorksets(); if (activeWorkset?.worksetId === worksetId) await activateWorkset(null); navigate('/app/worksets'); }}>Archive</Button></div>} />
    {editing && <Card className="mb-6 max-w-2xl p-5"><form className="space-y-4" onSubmit={save}><div><Label htmlFor="edit-workset-name">Name</Label><Input id="edit-workset-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div><Label htmlFor="edit-workset-description">Description</Label><Input id="edit-workset-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><fieldset><legend className="mb-2 text-sm font-medium">Modules</legend><div className="space-y-2">{allModules.filter((module) => module.status !== 'ARCHIVED').map((module) => <label key={module.moduleId} className="flex items-center gap-2 rounded border border-neutral-200 p-3 text-sm"><input type="checkbox" checked={moduleIds.includes(module.moduleId)} onChange={(event) => setModuleIds((current) => event.target.checked ? [...new Set([...current, module.moduleId])] : current.filter((id) => id !== module.moduleId))} />{module.name}</label>)}</div></fieldset><Button type="submit">Save Workset</Button></form></Card>}
    {unavailableIds.length > 0 && <ErrorState title="Unavailable Modules" message={`${unavailableIds.length} referenced Module${unavailableIds.length === 1 ? ' is' : 's are'} archived or unavailable. Edit the Workset to remove them.`} />}
    {modules.length === 0 ? <EmptyState title="No Modules in this Workset" description="Edit the Workset to add canonical Modules." /> : <div className="grid gap-4 sm:grid-cols-2">{modules.map((module) => module.status === 'ARCHIVED' ? <Card key={module.moduleId} className="p-4 opacity-60"><h2 className="font-semibold">{module.name}</h2><p className="text-sm text-neutral-500">Archived Module</p></Card> : <Link key={module.moduleId} to={`/app/modules/${module.moduleId}`}><Card className="p-4 hover:border-primary-300"><h2 className="font-semibold">{module.name}</h2><p className="mt-1 text-sm text-neutral-600">{module.description}</p></Card></Link>)}</div>}
  </PageContainer>;
}
