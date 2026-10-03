/**
 * Record History — displays chronological audit trail for a Record.
 * Reads from AuditService (durable audit entries), NOT from Event Bus.
 */
import { useState, useEffect } from 'react';
import services from '../../../infrastructure/services.js';

const ACTION_LABELS = {
  'record.created': 'Created',
  'record.draft_updated': 'Draft updated',
  'record.submitted': 'Submitted',
  'record.archived': 'Archived',
  'record.unarchived': 'Unarchived',
  'record.priority_changed': 'Priority changed',
  'record.cancelled': 'Cancelled',
  'form_request.completed': 'Form request completed',
  'delivery.created': 'Sent',
  'delivery.opened': 'Opened by recipient',
  'delivery.accepted': 'Accepted',
  'delivery.declined': 'Declined',
  'ledger.entry_registered': 'Registered in Ledger',
  'ledger.entry_cancelled': 'Ledger entry cancelled',
  'ledger.entry_voided': 'Ledger entry voided',
};

const ACTION_COLORS = {
  'record.created': 'bg-blue-100 text-blue-700',
  'record.draft_updated': 'bg-neutral-100 text-neutral-600',
  'record.submitted': 'bg-green-100 text-green-700',
  'record.archived': 'bg-neutral-100 text-neutral-600',
  'record.unarchived': 'bg-neutral-100 text-neutral-600',
  'record.priority_changed': 'bg-amber-100 text-amber-700',
  'record.cancelled': 'bg-red-100 text-red-700',
  'ledger.entry_registered': 'bg-indigo-100 text-indigo-700',
  'ledger.entry_cancelled': 'bg-red-100 text-red-600',
  'ledger.entry_voided': 'bg-neutral-100 text-neutral-500',
};

/**
 * @param {Object} props
 * @param {string} props.workspaceId
 * @param {string} props.recordId
 */
export default function RecordHistory({ workspaceId, recordId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId || !recordId) return;
    let cancelled = false;
    setLoading(true);
    services?.audit?.getResourceHistory(workspaceId, 'RECORD', recordId, { limit: 50 })
      .then((result) => {
        if (!cancelled && result?.items) {
          setEntries(result.items);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, recordId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-32 bg-neutral-100 rounded" />
        <div className="h-4 w-48 bg-neutral-100 rounded" />
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400">No history available yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.auditEntryId} className="flex items-start gap-3">
          <div className="mt-0.5 w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[entry.action] || 'bg-neutral-100 text-neutral-600'}`}>
                {ACTION_LABELS[entry.action] || entry.action}
              </span>
              <span className="text-xs text-neutral-400">
                {formatTs(entry.timestamp)}
              </span>
            </div>
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div className="mt-1 text-xs text-neutral-500">
                {entry.metadata.referenceNumber && (
                  <span className="font-mono">{entry.metadata.referenceNumber}</span>
                )}
                {entry.metadata.oldStatus && entry.metadata.newStatus && (
                  <span>{entry.metadata.oldStatus} → {entry.metadata.newStatus}</span>
                )}
                {entry.metadata.reason && <span> — {entry.metadata.reason}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTs(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ts; }
}
