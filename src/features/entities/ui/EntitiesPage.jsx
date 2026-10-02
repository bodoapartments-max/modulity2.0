import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';
import services from '../../../infrastructure/services.js';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { pluralizeEntityType, sortEntityTypes } from '../../../core/data/entityPresentation.js';

export default function EntitiesPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const loader = useCallback(async () => {
    await services.entityType.seedCoreTypes(workspaceId);
    const types = await services.entityType.listEntityTypes(workspaceId);
    const orderedTypes = sortEntityTypes(types);
    const counts = await Promise.all(orderedTypes.map((type) => services.entity.countEntitiesByType(workspaceId, type.typeId)));
    return orderedTypes.map((type, index) => ({ type, count: counts[index] }));
  }, [workspaceId]);
  const query = useWorkspaceQuery({ workspaceId, resource: 'entityDirectory', loader, enabled: Boolean(workspaceId), ttlMs: 15000 });
  if (!workspaceLoading && (workspaceError || !currentWorkspace)) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available Workspace before managing Entities." /></PageContainer>;
  if (workspaceLoading || query.initialLoading) return <PageContainer><LoadingState message="Loading Entity directory…" /></PageContainer>;
  return <PageContainer>
    <PageHeader title="Entities" description="Actual persistent business objects in this Workspace" action={<Link to="/app/entity-types" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">Manage Entity Types</Link>} />
    {query.error && <ErrorState message="Entity directory could not be refreshed." />}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(query.data || []).map(({ type, count }) => <Link key={type.typeId} to={`/app/entity-types/${encodeURIComponent(type.typeId)}/entities`} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"><Card className="h-full p-4 transition-colors hover:border-primary-300"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-neutral-900">{pluralizeEntityType(type.name)}</h2><p className="mt-1 text-sm text-neutral-600">{type.description}</p></div><span className="text-2xl font-semibold text-neutral-900">{count}</span></div><div className="mt-3"><Badge variant={type.category === 'CORE' ? 'neutral' : 'warning'}>{type.code}</Badge></div></Card></Link>)}</div>
    {!query.error && (query.data || []).length === 0 && <p className="text-sm text-neutral-500">No Entity Types are available.</p>}
  </PageContainer>;
}
