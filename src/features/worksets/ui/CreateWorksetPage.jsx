import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

export default function CreateWorksetPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [moduleIds, setModuleIds] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!currentWorkspace?.workspaceId) return undefined;
    services.module.listModules(currentWorkspace.workspaceId).then((items) => { if (!cancelled) setModules(items); }).catch(() => { if (!cancelled) setError('Modules could not be loaded.'); });
    return () => { cancelled = true; };
  }, [currentWorkspace?.workspaceId]);
  async function submit(event) {
    event.preventDefault();
    try { setSaving(true); setError(null); const workset = await services.workset.create({ workspaceId: currentWorkspace.workspaceId, name, description, moduleIds, createdBy: { actorType: 'USER', actorId: user.userId } }); workspaceQueryCache.invalidate(`${currentWorkspace.workspaceId}:worksets:`); navigate(`/app/worksets/${workset.worksetId}`); }
    catch { setError('The Workset could not be created.'); }
    finally { setSaving(false); }
  }
  return <PageContainer><PageHeader title="Create Workset" description="Choose canonical Modules for this work context." />{error && <ErrorState message={error} />}
    <Card className="max-w-2xl p-5"><form className="space-y-5" onSubmit={submit}><div><Label htmlFor="workset-name">Name</Label><Input id="workset-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div><Label htmlFor="workset-description">Description</Label><Input id="workset-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><fieldset><legend className="mb-2 text-sm font-medium">Modules</legend><div className="space-y-2">{modules.map((module) => <label key={module.moduleId} className="flex items-center gap-2 rounded border border-neutral-200 p-3 text-sm"><input type="checkbox" checked={moduleIds.includes(module.moduleId)} onChange={(event) => setModuleIds((current) => event.target.checked ? [...current, module.moduleId] : current.filter((id) => id !== module.moduleId))} />{module.name}</label>)}</div></fieldset><Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Workset'}</Button></form></Card>
  </PageContainer>;
}
