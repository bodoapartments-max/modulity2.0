/**
 * Ledger Book Detail — displays entries in a Ledger Book with pagination.
 * Cancelled/voided entries remain visible with distinct styling.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';

const ENTRY_STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
  VOIDED: 'bg-neutral-200 text-neutral-500',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
};

export default function LedgerBookPage() {
  const { ledgerBookId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const [book, setBook] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  const loadEntries = useCallback(async (startAfter = null) => {
    if (!workspaceId || !ledgerBookId) return;
    try {
      const result = await services?.ledgerQuery?.queryEntries({
        workspaceId,
        ledgerBookId,
        sortField: 'sequenceNumber',
        sortDirection: 'asc',
        startAfter,
        limit: 25,
      });
      if (result) {
        setEntries((prev) => startAfter ? [...prev, ...result.items] : result.items);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [workspaceId, ledgerBookId]);

  useEffect(() => {
    if (!workspaceId || !ledgerBookId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      services?.ledger?.getBook(workspaceId, ledgerBookId),
      loadEntries(),
    ]).then(([b]) => {
      if (!cancelled && b) setBook(b);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspaceId, ledgerBookId, loadEntries]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-neutral-200 rounded" />
          <div className="h-64 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  if (!book) {
    return <div className="p-6"><p className="text-neutral-500">Ledger book not found.</p></div>;
  }

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/app/ledger" className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; All Ledger Books
      </Link>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Book Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{book.name}</h1>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">{book.ledgerCode}</p>
            {book.description && <p className="text-sm text-neutral-500 mt-2">{book.description}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            book.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'
          }`}>
            {book.status}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <span className="text-neutral-500">Block Size</span>
            <p className="font-medium text-neutral-800">{book.blockSize}</p>
          </div>
          <div>
            <span className="text-neutral-500">Reference Prefix</span>
            <p className="font-medium text-neutral-800 font-mono">{book.referencePrefix}</p>
          </div>
          {book.moduleId && (
            <div>
              <span className="text-neutral-500">Module</span>
              <p className="font-medium text-neutral-800">{book.moduleId}</p>
            </div>
          )}
          {book.recordType && (
            <div>
              <span className="text-neutral-500">Record Type</span>
              <p className="font-medium text-neutral-800 font-mono text-xs">{book.recordType}</p>
            </div>
          )}
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="text-sm font-semibold text-neutral-700">Entries</h2>
        </div>
        {entries.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">No entries registered yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Record</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Registered</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry) => {
                const isCancelled = entry.entryStatus === 'CANCELLED' || entry.entryStatus === 'VOIDED';
                return (
                  <tr key={entry.ledgerEntryId} className={isCancelled ? 'opacity-60' : ''}>
                    <td className="px-4 py-3 font-mono text-neutral-600">{entry.sequenceNumber}</td>
                    <td className={`px-4 py-3 font-mono font-medium ${isCancelled ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                      {entry.referenceNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/records/${entry.recordId}`} className="text-primary-600 hover:underline">
                        {entry.recordId.substring(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{entry.recordType || '—'}</td>
                    <td className="px-4 py-3 text-neutral-500">{formatTs(entry.registeredAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ENTRY_STATUS_COLORS[entry.entryStatus] || ''}`}>
                        {entry.entryStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {hasMore && (
          <div className="px-4 py-3 border-t border-neutral-100 text-center">
            <button
              onClick={() => loadEntries(cursor)}
              className="text-sm text-primary-600 hover:underline font-medium"
            >
              Load more entries
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}
