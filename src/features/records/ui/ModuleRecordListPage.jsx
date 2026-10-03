/**
 * Module Record List — Shows Records created through a specific Module.
 *
 * Same List Engine as Global List, but with moduleId filter applied.
 * Route: /app/modules/:moduleId/records
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { buildModuleRecordColumns } from '../../../shared/presentation/recordListPresentation.js';
import services from '../../../infrastructure/services.js';
import RecordTable from './RecordTable.jsx';
import { Pagination } from '../../../design-system/index.js';
import { useRecordPagination } from '../hooks/useRecordPagination.js';

export default function ModuleRecordListPage() {
  const { moduleId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.uid || user?.userId;

  const [mod, setMod] = useState(null);
  const [records, setRecords] = useState([]);
  const [entityLabels, setEntityLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const columns = useMemo(() => buildModuleRecordColumns(mod), [mod]);

  useEffect(() => {
    if (!workspaceId || !moduleId) return;
    services?.module?.getModule(workspaceId, moduleId)
      .then(setMod)
      .catch(() => {});
  }, [workspaceId, moduleId]);

  const loadRecords = useCallback(async (cursor = null) => {
    if (!workspaceId || !moduleId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await services?.recordQuery?.queryRecords({
        workspaceId,
        userId,
        moduleId,
        bucket: 'ALL',
        sortField,
        sortDirection: sortDir.toUpperCase(),
        startAfter: cursor,
        limit: 25,
      });
      if (result) {
        const entityIds = result.items.flatMap((record) => (record.entityReferences || []).map((ref) => ref.entityId));
        const entities = entityIds.length && services?.entity?.getEntitiesByIds ? await services.entity.getEntitiesByIds(workspaceId, entityIds) : [];
        setEntityLabels((current) => ({ ...current, ...Object.fromEntries(entities.map((entity) => [entity.entityId, entity.displayName])) }));
        setRecords(result.items);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, moduleId, sortField, sortDir]);

  const { page, hasPrevious, goNext, goPrevious, reset } = useRecordPagination(loadRecords);

  useEffect(() => {
    reset();
    setRecords([]);
    setNextCursor(null);
    loadRecords(null);
  }, [loadRecords, reset]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleToggleSelect = (recordId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === records.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(records.map((r) => r.recordId)));
  };

  const handleToggleStar = async (recordId) => {
    try {
      await services?.folder?.toggleStar(workspaceId, userId, recordId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="p-6 max-w-7xl">
      <Link to={`/app/modules/${moduleId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to {mod?.name || 'Module'}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {mod?.name || 'Module'} Records
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Records created through this module
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mod?.status === 'ACTIVE' && <Link to={`/app/modules/${moduleId}/form`} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">New Record</Link>}
          <Link to={`/app/modules/${moduleId}`} className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors">Module Details</Link>
        </div>
      </div>

      <RecordTable
        records={records}
        loading={loading}
        error={error}
        sortField={sortField}
        sortDirection={sortDir}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onToggleStar={handleToggleStar}
        columns={columns}
        entityLabels={entityLabels}
        moduleId={moduleId}
        emptyMessage="No records yet"
        emptyDescription="Submit forms through this module to create records."
      />

      {!loading && records.length > 0 && (
        <Pagination
          className="mt-4"
          currentPage={page}
          pageInfo={`Page ${page} · ${records.length} records`}
          hasPrevious={hasPrevious}
          hasNext={hasMore}
          onPrevious={goPrevious}
          onNext={() => goNext(nextCursor)}
        />
      )}
    </div>
  );
}
