/**
 * Ledger Entry Detail — displays a single Ledger Entry.
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';

const STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
  VOIDED: 'bg-neutral-200 text-neutral-500',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
};

export default function LedgerEntryDetailPage() {
  const { ledgerBookId, ledgerEntryId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);

  const workspaceId = currentWorkspace?.workspaceId;

  useEffect(() => {
    if (!workspaceId || !ledgerEntryId) return;
    let cancelled = false;
    setLoading(true);
    services?.ledger?.getEntry(workspaceId, ledgerEntryId)
      .then((e) => { if (!cancelled) setEntry(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, ledgerEntryId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-32 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  if (!entry) {
    return <div className="p-6"><p className="text-neutral-500">Ledger entry not found.</p></div>;
  }

  const isCancelled = entry.entryStatus === 'CANCELLED' || entry.entryStatus === 'VOIDED';

  return (
    <div className="p-6 max-w-3xl">
      <Link to={`/app/ledger/${ledgerBookId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to Ledger Book
      </Link>

      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold font-mono ${isCancelled ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
              {entry.referenceNumber}
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">Sequence #{entry.sequenceNumber}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[entry.entryStatus] || ''}`}>
            {entry.entryStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Record</span>
            <p>
              <Link to={`/app/records/${entry.recordId}`} className="text-primary-600 hover:underline font-medium">
                {entry.recordId.substring(0, 12)}...
              </Link>
            </p>
          </div>
          {entry.recordType && (
            <div>
              <span className="text-neutral-500">Record Type</span>
              <p className="font-mono text-xs font-medium text-neutral-800">{entry.recordType}</p>
            </div>
          )}
          {entry.moduleVersion && (
            <div>
              <span className="text-neutral-500">Module Version</span>
              <p className="font-medium text-neutral-800">v{entry.moduleVersion}</p>
            </div>
          )}
          <div>
            <span className="text-neutral-500">Registered</span>
            <p className="font-medium text-neutral-800">{formatTs(entry.registeredAt)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Registered By</span>
            <p className="font-medium text-neutral-800">{entry.registeredBy?.actorId || '—'}</p>
          </div>
        </div>

        {entry.entryStatus === 'CANCELLED' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-sm font-medium text-red-700">Cancelled</p>
            {entry.cancellationReason && <p className="text-sm text-red-600 mt-1">{entry.cancellationReason}</p>}
            {entry.cancelledAt && <p className="text-xs text-red-400 mt-1">{formatTs(entry.cancelledAt)}</p>}
          </div>
        )}

        {entry.entryStatus === 'VOIDED' && (
          <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
            <p className="text-sm font-medium text-neutral-600">Voided</p>
            {entry.voidReason && <p className="text-sm text-neutral-500 mt-1">{entry.voidReason}</p>}
            {entry.voidedAt && <p className="text-xs text-neutral-400 mt-1">{formatTs(entry.voidedAt)}</p>}
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
