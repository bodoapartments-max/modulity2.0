import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { buildEntityListColumns, formatEntityListValue, pluralizeEntityType } from '../../../core/data/entityPresentation.js';

export default function EntityListPage() {
  const { entityTypeId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const [entityType, setEntityType] = useState(null);
  const [entities, setEntities] = useState([]);
  const [entityLabels, setEntityLabels] = useState({});
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const columns = useMemo(() => buildEntityListColumns(entityType), [entityType]);

  const load = useCallback(async (cursor = null) => {
    if (!workspaceId || !entityTypeId) return;
    setLoading(true);
    setError(null);
    try {
      const [type, page] = await Promise.all([services.entityType.getEntityType(workspaceId, entityTypeId), services.entity.listEntitiesPage(workspaceId, entityTypeId, { search: search || null, status: status || null, startAfter: cursor, limit: 25 })]);
      setEntityType(type);
      const ids = page.items.flatMap((entity) => Object.values(entity.data || {}).filter((value) => value && typeof value === 'object' && value.entityId).map((value) => value.entityId));
      const references = ids.length ? await services.entity.getEntitiesByIds(workspaceId, ids) : [];
      setEntityLabels((current) => ({ ...current, ...Object.fromEntries(references.map((entity) => [entity.entityId, entity.displayName])) }));
      setEntities(cursor ? (current) => [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [workspaceId, entityTypeId, search, status]);

  useEffect(() => { setEntities([]); setNextCursor(null); load(); }, [load]);
  if (loading && !entityType) return <PageContainer><LoadingState message="Loading Entities…" /></PageContainer>;
  if (error && !entityType) return <PageContainer><ErrorState title="Entities unavailable" message={error} /></PageContainer>;
  if (!entityType) return <PageContainer><ErrorState title="Entity Type unavailable" message="Entity Type not found." /></PageContainer>;
  const plural = pluralizeEntityType(entityType.name);
  return <PageContainer>
    <PageHeader title={plural} description={`${entityType.category === 'CORE' ? 'Core' : 'Domain'} Entity instances`} action={<div className="flex flex-wrap gap-2"><Link to={`/app/entity-types/${encodeURIComponent(entityTypeId)}`} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700">Type Details</Link><Link to={`/app/entity-types/${encodeURIComponent(entityTypeId)}/entities/new`} className="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white">Add {entityType.name}</Link></div>} />
    <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><Input aria-label={`Search ${plural}`} placeholder={`Search ${plural} by name`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} /><select aria-label="Entity status" className="rounded-md border border-neutral-300 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select><Button type="submit">Search</Button></form>
    {error && <ErrorState message={error} />}
    {loading && entities.length === 0 ? <LoadingState message={`Loading ${plural}…`} /> : entities.length === 0 ? <div className="rounded-xl border border-neutral-200 bg-neutral-50 py-12 text-center"><h2 className="font-semibold text-neutral-800">No {plural.toLowerCase()} yet</h2><p className="mt-1 text-sm text-neutral-500">Create the first {entityType.name.toLowerCase()} for this Workspace.</p><Link to={`/app/entity-types/${encodeURIComponent(entityTypeId)}/entities/new`} className="mt-4 inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">Add {entityType.name}</Link></div> : <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-neutral-200 bg-neutral-50"><tr><th className="px-4 py-3">Name</th>{columns.map((column) => <th key={column.key} className="px-4 py-3 text-neutral-600">{column.label}</th>)}</tr></thead><tbody>{entities.map((entity) => <tr key={entity.entityId} className="border-b border-neutral-100 hover:bg-neutral-50"><td className="px-4 py-3"><Link to={`/app/entities/${entity.entityId}?fromType=${encodeURIComponent(entityTypeId)}`} className="font-medium text-primary-700 hover:underline">{entity.displayName}</Link></td>{columns.map((column) => <td key={column.key} className="px-4 py-3 text-neutral-600">{column.key === 'status' ? <Badge variant={entity.status === 'ACTIVE' ? 'success' : 'neutral'}>{entity.status}</Badge> : formatEntityListValue(entity, column, entityLabels)}</td>)}</tr>)}</tbody></table></div>}
    {hasMore && !loading && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => load(nextCursor)}>Load More</Button></div>}
  </PageContainer>;
}
