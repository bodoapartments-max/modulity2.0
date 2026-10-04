/**
 * Ledger Book Detail — the Form Book's historical view with block strip,
 * filters, and a read-only Historical Form Viewer (V1 register style).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import HistoricalFormViewer from './HistoricalFormViewer.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import { Select } from '../../../design-system/index.js';
import { sortEntriesForViewer } from '../model.js';

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
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [refFilter, setRefFilter] = useState('');
  const [viewerEntry, setViewerEntry] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  const loadEntries = useCallback(async (startAfter = null, blockId = null) => {
    if (!workspaceId || !ledgerBookId) return;
    try {
      const result = await services?.ledgerQuery?.queryEntries({
        workspaceId,
        ledgerBookId,
        ledgerBlockId: blockId || undefined,
        sortField: 'sequenceNumber',
        sortDirection: 'asc',
        startAfter,
        limit: 100,
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

  const handleSelectBlock = useCallback((blockId) => {
    setSelectedBlockId(blockId);
    setEntries([]);
    setViewerEntry(null);
    void loadEntries(null, blockId);
  }, [loadEntries]);

  useEffect(() => {
    if (!workspaceId || !ledgerBookId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      services?.ledger?.getBook(workspaceId, ledgerBookId),
      services?.ledger?.listBlocks(workspaceId, ledgerBookId).catch(() => []),
    ]).then(([b, blockList]) => {
      if (cancelled) return;
      if (b) setBook(b);
      const blockId = b?.currentBlockId || blockList?.[blockList.length - 1]?.ledgerBlockId || null;
      setBlocks(blockList || []);
      setSelectedBlockId(blockId);
      void loadEntries(null, blockId);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspaceId, ledgerBookId, loadEntries]);

  const visibleEntries = useMemo(() => sortEntriesForViewer(entries.filter((entry) => {
    if (statusFilter && entry.entryStatus !== statusFilter) return false;
    if (refFilter && !`${entry.referenceNumber} ${entry.recordId}`.toLowerCase().includes(refFilter.toLowerCase())) return false;
    return true;
  })), [entries, statusFilter, refFilter]);

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
        &larr; All Form Books
      </Link>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Book Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-4">
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

        {/* Blocks strip */}
        {blocks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <p className="text-xs font-medium text-neutral-500 mb-2">Blocks</p>
            <div className="flex flex-wrap gap-2">
              {blocks.map((block) => {
                const active = block.ledgerBlockId === selectedBlockId;
                return (
                  <Button
                    key={block.ledgerBlockId}
                    type="button"
                    size="sm"
                    variant={active ? 'primary' : 'outline'}
                    onClick={() => handleSelectBlock(block.ledgerBlockId)}
                    aria-pressed={active}
                  >
                    #{block.blockNumber} · {block.startSequence}–{block.endSequence}
                    {block.status === 'FULL' ? ' · Full' : ''}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Select
          label="Status"
          options={[
            { value: '', label: 'All statuses' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'CANCELLED', label: 'Cancelled' },
            { value: 'VOIDED', label: 'Voided' },
          ]}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Search by reference / record id</label>
          <input
            type="search"
            value={refFilter}
            onChange={(e) => setRefFilter(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="e.g. ROOMINS-2026-000043"
            aria-label="Search entries"
          />
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Entries</h2>
          <span className="text-xs text-neutral-400">{visibleEntries.length} shown</span>
        </div>
        {visibleEntries.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">No entries match.</div>
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
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibleEntries.map((entry) => {
                const isVoided = entry.entryStatus !== 'ACTIVE';
                return (
                  <tr
                    key={entry.ledgerEntryId}
                    className={`${isVoided ? 'opacity-60' : ''} cursor-pointer hover:bg-neutral-50`}
                    onClick={() => setViewerEntry(entry)}
                  >
                    <td className="px-4 py-3 font-mono text-neutral-600">{entry.sequenceNumber}</td>
                    <td className={`px-4 py-3 font-mono font-medium ${isVoided ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                      {entry.referenceNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/records/${entry.recordId}`} className="text-primary-600 hover:underline" onClick={(e) => e.stopPropagation()}>
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
                    <td className="px-4 py-3 text-right">
                      <Button type="button" size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewerEntry(entry); }}>
                        View form
                      </Button>
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
              onClick={() => loadEntries(cursor, selectedBlockId)}
              className="text-sm text-primary-600 hover:underline font-medium"
            >
              Load older entries
            </button>
          </div>
        )}
      </div>

      <HistoricalFormViewer
        open={Boolean(viewerEntry)}
        onClose={() => setViewerEntry(null)}
        workspaceId={workspaceId}
        entry={viewerEntry}
        blockEntries={visibleEntries}
        onNavigate={(next) => setViewerEntry(next)}
      />
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
