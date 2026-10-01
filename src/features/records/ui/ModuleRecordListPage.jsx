/**
 * Module Record List — Shows Records created through a specific Module.
 *
 * Same List Engine as Global List, but with moduleId filter applied.
 * Route: /app/modules/:moduleId/records
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import RecordTable from './RecordTable.jsx';

export default function ModuleRecordListPage() {
  const { moduleId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.uid || user?.userId;

  const [mod, setMod] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

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
        setRecords(cursor ? (prev) => [...prev, ...result.items] : result.items);
        setHasMore(result.hasMore);
        setNextCursor(result.nextCursor);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId, moduleId, sortField, sortDir]);

  useEffect(() => {
    setRecords([]);
    setNextCursor(null);
    loadRecords(null);
  }, [loadRecords]);

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
        {mod?.status === 'ACTIVE' && (
          <Link
            to={`/app/modules/${moduleId}/form`}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            New Record
          </Link>
        )}
      </div>

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
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">No records yet</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Submit forms through this module to create records.
          </p>
          {mod?.status === 'ACTIVE' && (
            <Link
              to={`/app/modules/${moduleId}/form`}
              className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              Create Record
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
