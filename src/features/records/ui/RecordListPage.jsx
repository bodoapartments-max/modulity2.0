/**
 * Record List — Global Record list with filtering, sorting, and pagination.
 *
 * Uses RecordQueryService for paginated, bucket-aware queries.
 * This is a projection of canonical Records, NOT a separate collection.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import RecordListToolbar from './RecordListToolbar.jsx';
import RecordTable from './RecordTable.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import { workspaceQueryCache, workspaceQueryKey } from '../../../core/cache/workspaceQueryCache.js';

const BUCKETS = [
  { key: 'ALL', label: 'All' },
  { key: 'OWN', label: 'My Records' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'SENT', label: 'Sent' },
  { key: 'STARRED', label: 'Starred' },
  { key: 'ARCHIVED', label: 'Archived' },
];

export default function RecordListPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.uid || user?.userId;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Read filters from URL search params
  const bucket = searchParams.get('bucket') || 'ALL';
  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const moduleFilter = searchParams.get('module') || '';
  const sortField = searchParams.get('sort') || 'createdAt';
  const sortDir = searchParams.get('dir') || 'desc';
  const cacheKey = useMemo(() => workspaceId ? workspaceQueryKey(workspaceId, 'records', {
    userId, bucket, statusFilter, priorityFilter, moduleFilter, sortField, sortDir, page: 'first', limit: 25,
  }) : null, [workspaceId, userId, bucket, statusFilter, priorityFilter, moduleFilter, sortField, sortDir]);

  const loadRecords = useCallback(async (cursor = null, background = false) => {
    if (!workspaceId) {
      setRecords([]);
      setHasMore(false);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await services?.recordQuery?.queryRecords({
        workspaceId,
        userId,
        bucket,
        status: statusFilter || null,
        priority: priorityFilter || null,
        moduleId: moduleFilter || null,
        sortField,
        sortDirection: sortDir.toUpperCase(),
        startAfter: cursor,
        limit: 25,
      });
      if (result) {
        setRecords(cursor ? (prev) => [...prev, ...result.items] : result.items);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        if (!cursor && cacheKey) workspaceQueryCache.set(cacheKey, result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, userId, bucket, statusFilter, priorityFilter, moduleFilter, sortField, sortDir, cacheKey]);

  useEffect(() => {
    const cached = cacheKey ? workspaceQueryCache.get(cacheKey).data : null;
    if (cached) {
      setRecords(cached.items || []);
      setHasMore(cached.hasMore);
      setNextCursor(cached.nextCursor);
      setLoading(false);
      loadRecords(null, true);
    } else {
      setRecords([]);
      setNextCursor(null);
      loadRecords(null);
    }
  }, [loadRecords, cacheKey]);

  const handleBucketChange = (newBucket) => {
    const params = new URLSearchParams(searchParams);
    params.set('bucket', newBucket);
    setSearchParams(params);
  };

  const handleFilterChange = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setSearchParams(params);
  };

  const handleSort = (field) => {
    const params = new URLSearchParams(searchParams);
    if (sortField === field) {
      params.set('dir', sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sort', field);
      params.set('dir', 'desc');
    }
    setSearchParams(params);
  };

  const handleToggleSelect = (recordId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.recordId)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    try {
      const actor = { actorType: 'USER', actorId: userId };
      await services?.recordOperation?.bulkOperation(
        workspaceId, [...selectedIds], 'archive', {}, actor,
      );
      setSelectedIds(new Set());
      workspaceQueryCache.invalidate(`${workspaceId}:widgetResult:`);
      loadRecords(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStar = async (recordId) => {
    try {
      await services?.folder?.toggleStar(workspaceId, userId, recordId);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!workspaceLoading && (workspaceError || !currentWorkspace)) {
    return <ErrorState title="Workspace unavailable" message="Select an available workspace before viewing Records." />;
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Records</h1>
          <p className="text-sm text-neutral-500 mt-1">
            All records in this workspace
          </p>
        </div>
      </div>

      {/* Bucket Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => handleBucketChange(b.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              bucket === b.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <RecordListToolbar
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        moduleFilter={moduleFilter}
        onFilterChange={handleFilterChange}
        selectedCount={selectedIds.size}
        onBulkArchive={handleBulkArchive}
      />

      {refreshing && <p className="mb-2 text-xs text-neutral-400">Refreshing…</p>}
      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <RecordTable
        records={records}
        loading={loading}
        sortField={sortField}
        sortDirection={sortDir}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onToggleStar={handleToggleStar}
      />

      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={() => loadRecords(nextCursor)}
            className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="text-center py-16 bg-neutral-50 rounded-xl border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">No records found</h2>
          <p className="text-sm text-neutral-500">
            {bucket === 'ALL'
              ? 'Create records using Modules to see them here.'
              : `No records in the "${bucket}" view.`}
          </p>
        </div>
      )}
    </div>
  );
}
