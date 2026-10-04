/**
 * Record List — Global Record list with filtering, sorting, and pagination.
 *
 * Uses RecordQueryService for paginated, bucket-aware queries.
 * This is a projection of canonical Records, NOT a separate collection.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import RecordListToolbar from './RecordListToolbar.jsx';
import RecordTable from './RecordTable.jsx';
import { Button, EmptyState, ErrorState, Pagination, Tabs } from '../../../design-system/index.js';
import { workspaceQueryCache, workspaceQueryKey } from '../../../core/cache/workspaceQueryCache.js';
import {
  filterRecordsBySearch,
  getRecordDisplayLabel,
  resolveRecordSort,
} from '../model.js';
import { useRecordPagination } from '../hooks/useRecordPagination.js';

const BUCKETS = [
  { key: 'ALL', label: 'All' },
  { key: 'OWN', label: 'My Records' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'SENT', label: 'Sent' },
  { key: 'STARRED', label: 'Starred' },
  { key: 'ARCHIVED', label: 'Archived' },
];

const FILTER_KEYS = ['status', 'priority', 'module', 'sort', 'from', 'to', 'q'];

export default function RecordListPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.uid || user?.userId;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [modules, setModules] = useState([]);

  // Read filters from URL search params
  const bucket = searchParams.get('bucket') || 'ALL';
  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const moduleFilter = searchParams.get('module') || '';
  const sortValue = searchParams.get('sort') || 'newest';
  const fromDate = searchParams.get('from') || '';
  const toDate = searchParams.get('to') || '';
  const searchTerm = searchParams.get('q') || '';
  const sort = resolveRecordSort(sortValue);

  const cacheKey = useMemo(() => workspaceId ? workspaceQueryKey(workspaceId, 'records', {
    userId, bucket, statusFilter, priorityFilter, moduleFilter, sort: sort.value, fromDate, toDate, page: 'first', limit: 25,
  }) : null, [workspaceId, userId, bucket, statusFilter, priorityFilter, moduleFilter, sort.value, fromDate, toDate]);

  const moduleById = useMemo(
    () => Object.fromEntries(modules.map((mod) => [mod.moduleId, mod])),
    [modules],
  );

  useEffect(() => {
    if (!workspaceId || !services?.module?.listModules) return;
    let cancelled = false;
    services.module.listModules(workspaceId)
      .then((list) => { if (!cancelled) setModules(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);

  const labelFor = useCallback(
    (record) => getRecordDisplayLabel(
      record,
      moduleById[record.moduleId]?.formSchema?.fields || [],
      moduleById[record.moduleId] || null,
    ),
    [moduleById],
  );

  const loadRecords = useCallback(async (cursor = null, background = false) => {
    if (!workspaceId) {
      setRecords([]);
      setHasMore(false);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    setError(null);
    try {
      const result = await services?.recordQuery?.queryRecords({
        workspaceId,
        userId,
        bucket,
        status: statusFilter || null,
        priority: priorityFilter || null,
        moduleId: moduleFilter || null,
        sortField: sort.sortField,
        sortDirection: sort.sortDirection.toUpperCase(),
        createdFrom: fromDate ? `${fromDate}T00:00:00` : null,
        createdTo: toDate ? `${toDate}T23:59:59` : null,
        startAfter: cursor,
        limit: 25,
      });
      if (result) {
        setRecords(result.items);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
        if (!cursor && cacheKey) workspaceQueryCache.set(cacheKey, result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, bucket, statusFilter, priorityFilter, moduleFilter, sort.sortField, sort.sortDirection, fromDate, toDate, cacheKey]);

  const { page, hasPrevious, goNext, goPrevious, reset } = useRecordPagination(loadRecords);

  useEffect(() => {
    reset();
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
  }, [loadRecords, cacheKey, reset]);

  const visibleRecords = useMemo(
    () => filterRecordsBySearch(records, searchTerm, labelFor),
    [records, searchTerm, labelFor],
  );

  const hasActiveFilters = Boolean(
    statusFilter || priorityFilter || moduleFilter || fromDate || toDate || searchTerm || sortValue !== 'newest',
  );

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

  const handleClearFilters = () => {
    const params = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach((key) => params.delete(key));
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
    if (selectedIds.size === visibleRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRecords.map((r) => r.recordId)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    try {
      // Bulk archive is a presentation convenience: each Record is archived
      // through its own trusted ARCHIVE_RECORD command (server-authoritative).
      for (const recordId of [...selectedIds]) {
        await services?.recordCommand?.archiveRecord({ workspaceId, recordId });
      }
      setSelectedIds(new Set());
      workspaceQueryCache.invalidate(`${workspaceId}:widgetResult:`);
      reset();
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

  const columns = useMemo(() => [
    {
      key: 'title',
      label: 'Title',
      scope: 'DATA',
      render: (record) => (
        <Link
          to={`/app/records/${record.recordId}`}
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-neutral-900 hover:text-primary-600"
        >
          {labelFor(record)}
        </Link>
      ),
    },
    {
      key: 'module',
      label: 'Module',
      scope: 'SYSTEM',
      render: (record) => moduleById[record.moduleId]?.name || record.recordType || '—',
    },
    { key: 'status', label: 'Status', scope: 'SYSTEM' },
    { key: 'priority', label: 'Priority', scope: 'SYSTEM' },
    { key: 'createdAt', label: 'Created', scope: 'SYSTEM' },
    { key: 'updatedAt', label: 'Updated', scope: 'SYSTEM' },
  ], [labelFor, moduleById]);

  if (!workspaceLoading && (workspaceError || !currentWorkspace)) {
    return <ErrorState title="Workspace unavailable" message="Select an available workspace before viewing Records." />;
  }

  const renderBody = () => {
    if (!loading && records.length === 0 && hasActiveFilters && !error) {
      return (
        <EmptyState
          title="No records match these filters"
          description="Adjust or clear the filters to see more records."
        >
          <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      );
    }
    if (!loading && records.length > 0 && visibleRecords.length === 0 && !error) {
      return (
        <EmptyState
          title="No matching records on this page"
          description="Try another term or go to the next page"
        >
          <Button type="button" variant="outline" size="sm" onClick={() => handleFilterChange('q', '')}>
            Clear search
          </Button>
        </EmptyState>
      );
    }
    return (
      <RecordTable
        records={visibleRecords}
        loading={loading}
        error={error}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onToggleStar={handleToggleStar}
        columns={columns}
        labelFor={labelFor}
        emptyMessage="No records yet"
        emptyDescription="Create records using Modules to see them here."
      />
    );
  };

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Records</h1>
          <p className="text-sm text-neutral-500 mt-1">
            All canonical Records in this workspace
          </p>
        </div>
      </div>

      <Tabs
        tabs={BUCKETS}
        activeTab={bucket}
        onChange={handleBucketChange}
        ariaLabel="Record buckets"
        className="mb-4"
      />

      <RecordListToolbar
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        moduleFilter={moduleFilter}
        moduleOptions={modules.map((mod) => ({ value: mod.moduleId, label: mod.name }))}
        sortValue={sortValue}
        fromDate={fromDate}
        toDate={toDate}
        searchTerm={searchTerm}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
        selectedCount={selectedIds.size}
        onBulkArchive={handleBulkArchive}
      />

      {renderBody()}

      {!loading && visibleRecords.length > 0 && (
        <Pagination
          className="mt-4"
          currentPage={page}
          pageInfo={`Page ${page} · ${visibleRecords.length} records`}
          hasPrevious={hasPrevious}
          hasNext={hasMore}
          onPrevious={goPrevious}
          onNext={() => goNext(nextCursor)}
        />
      )}
    </div>
  );
}
