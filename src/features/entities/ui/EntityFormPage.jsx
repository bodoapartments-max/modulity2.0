import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import services from '../../../infrastructure/services.js';
import { FormRenderer } from '../../../modules/forms/FormRenderer.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';

export default function EntityFormPage() {
  const { entityTypeId: routeTypeId, entityId } = useParams();
  const editing = Boolean(entityId);
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const workspaceId = currentWorkspace?.workspaceId;
  const [entityType, setEntityType] = useState(null);
  const [entity, setEntity] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const existing = editing ? await services.entity.getEntity(workspaceId, entityId) : null;
        const typeId = existing?.entityTypeId || routeTypeId;
        const type = await services.entityType.getEntityType(workspaceId, typeId);
        if (!type || (editing && !existing)) throw new Error('Entity or Entity Type not found.');
        if (!cancelled) { setEntity(existing); setEntityType(type); setDisplayName(existing?.displayName || ''); setStatus(existing?.status || 'ACTIVE'); }
      } catch (loadError) { if (!cancelled) setError(loadError.message); } finally { if (!cancelled) setLoading(false); }
    };
    if (workspaceId && (routeTypeId || entityId)) load();
    return () => { cancelled = true; };
  }, [workspaceId, routeTypeId, entityId, editing]);

  const submit = async (data) => {
    if (!displayName.trim()) return setError('Display name is required.');
    setSaving(true);
    setError(null);
    try {
      const actor = { actorType: 'USER', actorId: user.userId };
      const saved = editing ? await services.entity.updateEntity(workspaceId, entityId, { displayName: displayName.trim(), data, status }, actor) : await services.entity.createEntity({ workspaceId, entityTypeId: entityType.typeId, displayName: displayName.trim(), data, createdBy: actor });
      workspaceQueryCache.invalidate(`${workspaceId}:entities:`);
      workspaceQueryCache.invalidate(`${workspaceId}:entityDirectory:`);
      workspaceQueryCache.invalidate(`${workspaceId}:entityTypeDetail:`);
      navigate(`/app/entities/${saved.entityId}?fromType=${encodeURIComponent(entityType.typeId)}`);
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  };

  if (loading) return <PageContainer><LoadingState message="Loading Entity form…" /></PageContainer>;
  if (!entityType) return <PageContainer><Alert variant="error">{error || 'Entity Type unavailable.'}</Alert></PageContainer>;
  const listPath = `/app/entity-types/${encodeURIComponent(entityType.typeId)}/entities`;
  return <PageContainer>
    <PageHeader title={`${editing ? 'Edit' : 'Add'} ${entityType.name}`} description={`Schema-driven ${entityType.category === 'CORE' ? 'Core' : 'Domain'} Entity`} action={<Link to={editing ? `/app/entities/${entityId}?fromType=${encodeURIComponent(entityType.typeId)}` : listPath} className="text-sm text-primary-600 hover:underline">Cancel</Link>} />
    {error && <Alert variant="error" className="mb-4">{error}</Alert>}
    <Card className="p-5"><div className="mb-4 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="entity-display-name" required>Display Name</Label><Input id="entity-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={saving} /></div>{editing && <div><Label htmlFor="entity-lifecycle-status">Lifecycle Status</Label><select id="entity-lifecycle-status" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="ARCHIVED">ARCHIVED</option></select></div>}</div><FormRenderer schema={{ schemaVersion: entityType.schemaVersion || '1.0.0', fields: entityType.fields || [] }} initialValues={entity?.data || {}} onSubmit={submit} workspaceId={workspaceId} submitLabel={editing ? `Save ${entityType.name}` : `Create ${entityType.name}`} loading={saving} /></Card>
  </PageContainer>;
}
