import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import DataGrid from '../../../design-system/components/DataGrid/DataGrid.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Pagination from '../../../design-system/components/Pagination/Pagination.jsx';
import Select from '../../../design-system/components/Select/Select.jsx';
import { buildEntityListColumns, formatEntityListValue, pluralizeEntityType } from '../../../shared/presentation/entityPresentation.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' },
];

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

  const dataGridColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Name',
      render: (entity) => (
        <Link
          to={`/app/entities/${entity.entityId}?fromType=${encodeURIComponent(entityTypeId)}`}
          className="font-medium text-primary-700 hover:underline"
        >
          {entity.displayName}
        </Link>
      ),
    },
    ...columns.map((column) => ({
      key: column.key,
      header: column.label,
      render: (entity) => {
        if (column.key === 'status') {
          return <Badge variant={entity.status === 'ACTIVE' ? 'success' : 'neutral'}>{entity.status}</Badge>;
        }
        return formatEntityListValue(entity, column, entityLabels);
      },
    })),
  ], [columns, entityLabels, entityTypeId]);

  const load = useCallback(async (cursor = null) => {
    if (!workspaceId || !entityTypeId) return;
    setLoading(true);
    setError(null);
    try {
      const [type, page] = await Promise.all([
        services.entityType.getEntityType(workspaceId, entityTypeId),
        services.entity.listEntitiesPage(workspaceId, entityTypeId, { search: search || null, status: status || null, startAfter: cursor, limit: 25 }),
      ]);
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
    <form onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <Input aria-label={`Search ${plural}`} placeholder={`Search ${plural} by name`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} />
      <Select
        aria-label="Entity status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      />
      <Button type="submit">Search</Button>
    </form>
    {error && <ErrorState message={error} />}
    <DataGrid
      columns={dataGridColumns}
      rows={entities}
      rowKey={(entity) => entity.entityId}
      loading={loading && entities.length === 0}
      emptyMessage={`No ${plural.toLowerCase()} yet`}
      emptyDescription={`Create the first ${entityType.name.toLowerCase()} for this Workspace.`}
      error={error}
      ariaLabel={`${plural} list`}
    />
    {hasMore && !loading && (
      <Pagination
        className="mt-4"
        hasPrevious={false}
        hasNext={hasMore}
        pageInfo="More results available"
        onNext={() => load(nextCursor)}
      />
    )}
  </PageContainer>;
}
