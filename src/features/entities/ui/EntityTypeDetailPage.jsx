import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
import services from '../../../infrastructure/services.js';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { useToast } from '../../../design-system/index.js';
import { pluralizeEntityType } from '../../../shared/presentation/entityPresentation.js';
import AdminActions from '../../../features/admin/ui/AdminActions.jsx';

export default function EntityTypeDetailPage() {
  const { entityTypeId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const workspaceId = currentWorkspace?.workspaceId;
  const [busy, setBusy] = useState(false);
  const loader = useCallback(async () => {
    const [entityType, count, modules] = await Promise.all([services.entityType.getEntityType(workspaceId, entityTypeId), services.entity.countEntitiesByType(workspaceId, entityTypeId), services.module.listModules(workspaceId)]);
    if (!entityType) throw new Error('Entity Type not found.');
    const usedBy = modules.filter((module) => module.primaryEntityTypeId === entityTypeId || module.formSchema?.fields?.some((field) => field.type === 'entity-reference' && field.entityTypeId === entityTypeId));
    return { entityType, count, usedBy };
  }, [workspaceId, entityTypeId]);
  const query = useWorkspaceQuery({ workspaceId, resource: 'entityTypeDetail', params: { entityTypeId }, loader, enabled: Boolean(workspaceId && entityTypeId) });
  if (query.initialLoading) return <PageContainer><LoadingState message="Loading Entity Type…" /></PageContainer>;
  if (query.error || !query.data) return <PageContainer><ErrorState title="Entity Type unavailable" message={query.error?.message || 'Entity Type not found.'} /></PageContainer>;
  const { entityType, count, usedBy } = query.data;
  const plural = pluralizeEntityType(entityType.name);
  const base = `/app/entity-types/${encodeURIComponent(entityType.typeId)}/entities`;
  return <PageContainer>
    <PageHeader title={entityType.name} description={entityType.description || 'Persistent business object definition'} action={<Link to="/app/entity-types" className="text-sm text-primary-600 hover:underline">Back to Entity Types</Link>} />
    <div className="mb-6 flex flex-wrap gap-2"><Link to={base} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">View {plural}</Link><Link to={`${base}/new`} className="rounded-md border border-primary-300 px-4 py-2 text-sm font-medium text-primary-700">Add {entityType.name}</Link></div>
    <div className="grid gap-4 md:grid-cols-3"><Card className="p-4"><p className="text-sm text-neutral-500">Code</p><p className="mt-1 font-mono font-medium text-neutral-900">{entityType.code}</p></Card><Card className="p-4"><p className="text-sm text-neutral-500">Type</p><div className="mt-1"><Badge variant={entityType.category === 'CORE' ? 'neutral' : 'warning'}>{entityType.category === 'CORE' ? 'Core Entity Type' : 'Domain Entity Type'}</Badge></div></Card><Card className="p-4"><p className="text-sm text-neutral-500">Entities</p><p className="mt-1 text-2xl font-semibold text-neutral-900">{count}</p></Card></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><Card className="p-4"><h2 className="font-semibold text-neutral-900">Fields ({entityType.fields?.length || 0})</h2>{entityType.fields?.length ? <ul className="mt-3 divide-y divide-neutral-100">{entityType.fields.map((field) => <li key={field.key} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-neutral-800">{field.label}</span><span className="text-neutral-500">{field.type}{field.required ? ' · required' : ''}</span></li>)}</ul> : <p className="mt-3 text-sm text-neutral-500">No custom fields.</p>}</Card><Card className="p-4"><h2 className="font-semibold text-neutral-900">Used By ({usedBy.length})</h2>{usedBy.length ? <ul className="mt-3 space-y-2">{usedBy.map((module) => <li key={module.moduleId}><Link to={`/app/modules/${module.moduleId}/records`} className="text-sm font-medium text-primary-600 hover:underline">{module.name}</Link></li>)}</ul> : <p className="mt-3 text-sm text-neutral-500">No Modules reference this Entity Type yet.</p>}</Card></div>
    {entityType.category !== 'CORE' && (
      <AdminActions
        resourceLabel={`Entity Type "${entityType.name}"`}
        status={entityType.status || 'ACTIVE'}
        busy={busy}
        onRename={async (newLabel) => {
          setBusy(true);
          try { await services.entityType.updateEntityType(workspaceId, entityType.typeId, { name: newLabel }); await query.refresh(); showToast({ message: 'Renamed', variant: 'success' }); }
          catch (err) { showToast({ message: err.message, variant: 'error' }); } finally { setBusy(false); }
        }}
        onArchive={async () => { setBusy(true); try { await services.entityType.archiveEntityType(workspaceId, entityType.typeId); await query.refresh(); showToast({ message: 'Archived', variant: 'success' }); } catch (err) { showToast({ message: err.message, variant: 'error' }); } finally { setBusy(false); } }}
        onRestore={async () => { setBusy(true); try { await services.entityType.restoreEntityType(workspaceId, entityType.typeId); await query.refresh(); showToast({ message: 'Restored', variant: 'success' }); } catch (err) { showToast({ message: err.message, variant: 'error' }); } finally { setBusy(false); } }}
        onDelete={async () => {
          setBusy(true);
          try { await services.entityType.deleteEntityType(workspaceId, entityType.typeId); showToast({ message: 'Deleted', variant: 'success' }); navigate('/app/entity-types'); }
          catch (err) { showToast({ message: err.message, variant: 'error' }); setBusy(false); }
        }}
      />
    )}
  </PageContainer>;
}
