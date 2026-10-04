/**
 * Record Detail — displays a canonical Record.
 *
 * CRITICAL INVARIANT: A historical Record must always be rendered using
 * the exact Module Version that created it (loaded via useRecordWithSchema),
 * NOT the current Module schema.
 *
 * This page is a view over the same canonical Record — it never stores or
 * duplicates Record data. Print and export read the already-loaded Record.
 *
 * Trust boundary notes:
 * - "Edit draft" navigates to the DRAFT editor; all draft mutations run
 *   through the trusted UPDATE_DRAFT command (Step 15).
 * - Lifecycle actions (Submit/Archive/Restore/Cancel) call trusted commands;
 *   this page only discovers which buttons to show via the shared pure
 *   policy — the server re-evaluates authoritatively.
 * - "Create copy" only PREFILLS a Module form; the new Record is created
 *   through the trusted recordCommand CREATE_RECORD path.
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { formatDisplayValue } from '../../../modules/forms/displayFormatter.js';
import RecordHistory from './RecordHistory.jsx';
import { useRecordWithSchema } from '../hooks/useRecordWithSchema.js';
import {
  getRecordBackNavigation,
  getRecordDisplayLabel,
  getRecordStatusVariant,
  getRecordPriorityVariant,
  formatActorLabel,
  getAvailableRecordActions,
  buildRecordCopyValues,
  buildRecordExport,
} from '../model.js';
import { RECORD_ACTIONS } from '../../../core/recordCommands/recordActionPolicy.js';
import { Badge, Button, Dialog, useToast } from '../../../design-system/index.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import ContextConversationLink from '../../chat/ui/ContextConversationLink.jsx';
import services from '../../../infrastructure/services.js';

function actionToastMessage(action) {
  switch (action) {
    case RECORD_ACTIONS.SUBMIT_RECORD: return 'Record submitted';
    case RECORD_ACTIONS.ARCHIVE_RECORD: return 'Record archived';
    case RECORD_ACTIONS.RESTORE_RECORD: return 'Record restored';
    case RECORD_ACTIONS.CANCEL_RECORD: return 'Record cancelled';
    default: return 'Action completed';
  }
}

export default function RecordDetailPage() {
  const { recordId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.uid || user?.userId;

  const workspaceId = currentWorkspace?.workspaceId;
  const { record, mod, fields, schemaSource, entityNames, loading, error, reload } =
    useRecordWithSchema(workspaceId, recordId);

  // UI action discovery only — the trusted server re-evaluates policy and
  // lifecycle on every command. selectedAccess is derived from the current
  // workspace context (Personal owner vs organization member).
  const actorContext = useMemo(() => ({
    authenticated: Boolean(user),
    workspaceAccess: !currentWorkspace
      ? null
      : currentWorkspace.type === 'PERSONAL' ? 'PERSONAL_OWNER' : 'ORGANIZATION_MEMBER',
  }), [user, currentWorkspace]);

  const availableActions = useMemo(
    () => getAvailableRecordActions(record, mod, actorContext),
    [record, mod, actorContext],
  );
  const actionEnabled = useCallback(
    (action) => availableActions.find((a) => a.action === action)?.enabled === true,
    [availableActions],
  );

  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const runTrustedAction = useCallback(async (action) => {
    setActionError(null);
    setActionBusy(true);
    try {
      const command = {
        [RECORD_ACTIONS.SUBMIT_RECORD]: services.recordCommand.submitRecord,
        [RECORD_ACTIONS.ARCHIVE_RECORD]: services.recordCommand.archiveRecord,
        [RECORD_ACTIONS.RESTORE_RECORD]: services.recordCommand.restoreRecord,
        [RECORD_ACTIONS.CANCEL_RECORD]: services.recordCommand.cancelRecord,
      }[action];
      await command({ workspaceId, recordId });
      workspaceQueryCache.invalidate(`${workspaceId}:records:`);
      workspaceQueryCache.invalidate(`${workspaceId}:dashboardRecords:`);
      setConfirmAction(null);
      showToast({ message: actionToastMessage(action), variant: 'success' });
      reload();
    } catch (err) {
      setActionError(err.message || 'Action failed');
      setConfirmAction(null);
    } finally {
      setActionBusy(false);
    }
  }, [workspaceId, recordId, reload, showToast]);

  const title = useMemo(
    () => (record ? getRecordDisplayLabel(record, fields, mod) : ''),
    [record, fields, mod],
  );

  const backNavigation = getRecordBackNavigation(searchParams.get('fromModule'), mod);

  const handleCopy = useCallback(() => {
    if (!record?.moduleId) return;
    const prefillValues = buildRecordCopyValues(record, fields);
    navigate(`/app/modules/${record.moduleId}/form`, {
      state: { prefillValues, copySourceLabel: title },
    });
  }, [record, fields, navigate, title]);

  const handleExport = useCallback(() => {
    if (!record) return;
    const payload = buildRecordExport(record, fields, {
      moduleName: mod?.name ?? null,
      entityNames,
      currentUserId: userId ?? null,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `record-${record.recordId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [record, fields, mod, entityNames, userId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-64 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-6">
        <p className="text-neutral-500">Record not found.</p>
      </div>
    );
  }

  const priorityVariant = getRecordPriorityVariant(record.priority);

  return (
    <div className="p-6 max-w-3xl">
      <Link to={backNavigation.to} className="no-print text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; {backNavigation.label}
      </Link>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Record Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900 break-words">
              {title}
            </h1>
            <p className="text-xs text-neutral-400 font-mono mt-0.5" title={record.recordId}>
              {record.recordId}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={getRecordStatusVariant(record.status)}>{record.status}</Badge>
            {priorityVariant && <Badge variant={priorityVariant}>{record.priority}</Badge>}
          </div>
        </div>

        {/* Actions — presentation only; hidden in print */}
        <div className="no-print mb-5 flex flex-wrap gap-2">
          {actionEnabled(RECORD_ACTIONS.EDIT_DRAFT) && (
            <Link to={`/app/records/${record.recordId}/edit`}>
              <Button type="button" variant="primary" size="sm">Edit draft</Button>
            </Link>
          )}
          {actionEnabled(RECORD_ACTIONS.SUBMIT_RECORD) && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={actionBusy}
              onClick={() => runTrustedAction(RECORD_ACTIONS.SUBMIT_RECORD)}
            >
              Submit record
            </Button>
          )}
          {record.moduleId && (
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              Create copy
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            Export JSON
          </Button>
          {actionEnabled(RECORD_ACTIONS.ARCHIVE_RECORD) && (
            <Button type="button" variant="outline" size="sm" disabled={actionBusy} onClick={() => setConfirmAction(RECORD_ACTIONS.ARCHIVE_RECORD)}>
              Archive
            </Button>
          )}
          {actionEnabled(RECORD_ACTIONS.RESTORE_RECORD) && (
            <Button type="button" variant="outline" size="sm" disabled={actionBusy} onClick={() => runTrustedAction(RECORD_ACTIONS.RESTORE_RECORD)}>
              Restore
            </Button>
          )}
          {actionEnabled(RECORD_ACTIONS.CANCEL_RECORD) && (
            <Button type="button" variant="danger" size="sm" disabled={actionBusy} onClick={() => setConfirmAction(RECORD_ACTIONS.CANCEL_RECORD)}>
              Cancel record
            </Button>
          )}

          <ContextConversationLink
            contextReference={record && workspaceId ? { type: 'RECORD', id: record.recordId, workspaceId } : null}
            label="Discuss"
          />
        </div>
        {actionError && (
          <div className="no-print mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Module</span>
            <p className="font-medium text-neutral-800">
              {record.moduleId && mod ? (
                <Link to={`/app/modules/${record.moduleId}`} className="text-primary-600 hover:underline">
                  {mod.name}
                </Link>
              ) : (mod?.name || '—')}
            </p>
          </div>
          <div>
            <span className="text-neutral-500">Record Type</span>
            <p className="font-medium text-neutral-800 font-mono text-xs">{record.recordType}</p>
          </div>
          {record.moduleVersion && (
            <div>
              <span className="text-neutral-500">Module Version</span>
              <p className="font-medium text-neutral-800">v{record.moduleVersion}</p>
            </div>
          )}
          {currentWorkspace?.name && (
            <div>
              <span className="text-neutral-500">Workspace</span>
              <p className="font-medium text-neutral-800">{currentWorkspace.name}</p>
            </div>
          )}
          <div>
            <span className="text-neutral-500">Created</span>
            <p className="font-medium text-neutral-800">{formatTimestamp(record.createdAt)}</p>
            <p className="text-xs text-neutral-400">by {formatActorLabel(record.createdBy, userId)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Updated</span>
            <p className="font-medium text-neutral-800">{formatTimestamp(record.updatedAt)}</p>
          </div>
          {record.submittedAt && (
            <div>
              <span className="text-neutral-500">Submitted</span>
              <p className="font-medium text-neutral-800">{formatTimestamp(record.submittedAt)}</p>
              {record.submittedBy && (
                <p className="text-xs text-neutral-400">by {formatActorLabel(record.submittedBy, userId)}</p>
              )}
            </div>
          )}
        </div>

        {/* Schema source indicator */}
        {schemaSource === 'historical' && (
          <p className="text-xs text-neutral-400 mt-3">
            Rendered using Module Version {record.moduleVersion} schema
          </p>
        )}
        {schemaSource === 'current' && record.moduleVersion && (
          <p className="text-xs text-amber-500 mt-3">
            Version {record.moduleVersion} schema not found — rendering with current Module schema
          </p>
        )}
      </div>

      {/* Record Data */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">Data</h2>

        {fields.length > 0 ? (
          <div className="space-y-3">
            {fields.map((field) => {
              const value = record.data?.[field.key];
              const display = formatDisplayValue(value, field, { entityNames });
              return (
                <div key={field.key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 py-2 border-b border-neutral-100 last:border-0">
                  <span className="text-sm text-neutral-500 sm:w-40 flex-shrink-0">{field.label}</span>
                  <span className="text-sm text-neutral-900 font-medium">{display}</span>
                </div>
              );
            })}
          </div>
        ) : (
          // Fallback: display raw data fields
          <div className="space-y-3">
            {Object.entries(record.data || {}).map(([key, value]) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 py-2 border-b border-neutral-100 last:border-0">
                <span className="text-sm text-neutral-500 sm:w-40 flex-shrink-0">{key}</span>
                <span className="text-sm text-neutral-900 font-medium">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Entity References */}
        {record.entityReferences?.length > 0 && (
          <div className="mt-6 pt-4 border-t border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">Entity References</h3>
            <div className="space-y-1">
              {record.entityReferences.map((ref, i) => {
                const resolved = entityNames[ref.entityId];
                return (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500">{ref.entityTypeId}:</span>
                    {resolved ? (
                      <Link
                        to={`/app/entities/${ref.entityId}`}
                        className="text-primary-600 hover:underline font-medium"
                      >
                        {resolved}
                      </Link>
                    ) : (
                      <span className="text-neutral-500">
                        {ref.entityId} (unavailable)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ledger Reference */}
      {record.referenceNumber && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">Ledger Registration</h2>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-neutral-500">Reference</span>
              <p className="font-mono font-bold text-neutral-900">{record.referenceNumber}</p>
            </div>
            {record.ledgerBookId && (
              <div>
                <span className="text-neutral-500">Ledger Book</span>
                <p>
                  <Link to={`/app/ledger/${record.ledgerBookId}`} className="text-primary-600 hover:underline font-medium">
                    View Book
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trusted Ledger Registration (Step 16) */}
      {!record.referenceNumber && (
        <LedgerRegistrationPanel
          workspaceId={workspaceId}
          record={record}
          onRegistered={() => { workspaceQueryCache.invalidate(`${workspaceId}:records:`); reload(); }}
        />
      )}

      {/* Record History (Audit Trail) — from the canonical Audit Service */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">History</h2>
        <RecordHistory workspaceId={workspaceId} recordId={recordId} />
        <p className="no-print mt-3 text-xs text-neutral-400">
          Full trusted Ledger/Audit backend is a separate roadmap milestone; this view reads
          the durable audit entries that exist today.
        </p>
      </div>

      <Dialog
        open={confirmAction === RECORD_ACTIONS.ARCHIVE_RECORD}
        onClose={() => setConfirmAction(null)}
        title="Archive Record"
      >
        <p className="text-sm text-neutral-600 mb-5">
          Archiving hides this Record from active lists. The canonical Record, its history
          and Ledger references are preserved; archiving is reversible.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)}>Keep</Button>
          <Button type="button" variant="primary" disabled={actionBusy} onClick={() => runTrustedAction(RECORD_ACTIONS.ARCHIVE_RECORD)}>
            Archive
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmAction === RECORD_ACTIONS.CANCEL_RECORD}
        onClose={() => setConfirmAction(null)}
        title="Cancel Record"
      >
        <p className="text-sm text-neutral-600 mb-5">
          Cancelling marks this Record as cancelled on the trusted server. The Record stays
          in history; this action is not designed to be reversed.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmAction(null)}>Back</Button>
          <Button type="button" variant="danger" disabled={actionBusy} onClick={() => runTrustedAction(RECORD_ACTIONS.CANCEL_RECORD)}>
            Cancel record
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

/**
 * Ledger Registration panel — registers the canonical Record into an ACTIVE
 * Ledger Book through the TRUSTED ledgerCommand boundary. Sequence number,
 * reference, actor and timestamps are all server-derived; the browser only
 * sends workspaceId + recordId + ledgerBookId + operationId.
 */
function LedgerRegistrationPanel({ workspaceId, record, onRegistered }) {
  const [books, setBooks] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const registrable = ['SUBMITTED', 'ACTIVE', 'COMPLETED'].includes(record.status);

  useEffect(() => {
    if (!registrable || !workspaceId || books !== null || !services?.ledger?.listBooks) return;
    let cancelled = false;
    services.ledger.listBooks(workspaceId)
      .then((list) => { if (!cancelled) setBooks(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setBooks([]); });
    return () => { cancelled = true; };
  }, [workspaceId, books, registrable]);

  if (!registrable || !workspaceId) return null;

  if (!books) {
    return (
      <div className="no-print bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="animate-pulse h-4 w-40 bg-neutral-100 rounded" />
      </div>
    );
  }
  const eligible = books.filter((book) => book.status === 'ACTIVE'
    && (!book.moduleId || book.moduleId === record.moduleId)
    && (!book.recordType || book.recordType === record.recordType));
  if (eligible.length === 0) return null;

  const selected = selectedBookId || eligible[0].ledgerBookId;

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      await services?.ledgerCommand?.registerEntry({
        workspaceId,
        recordId: record.recordId,
        ledgerBookId: selected,
      });
      onRegistered();
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print bg-white border border-neutral-200 rounded-xl p-6 mb-6">
      <h2 className="text-lg font-semibold text-neutral-800 mb-1">Ledger Registration</h2>
      <p className="text-xs text-neutral-500 mb-3">
        Register this Record into a Ledger. Numbering and the reference are assigned
        by the trusted server; a Record can be registered only once per Ledger Book.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          aria-label="Ledger book"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm bg-white"
          value={selected}
          onChange={(event) => setSelectedBookId(event.target.value)}
        >
          {eligible.map((book) => (
            <option key={book.ledgerBookId} value={book.ledgerBookId}>{book.name}</option>
          ))}
        </select>
        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={handleRegister}>
          {busy ? 'Registering…' : 'Register in Ledger'}
        </Button>
      </div>
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">{error}</div>
      )}
    </div>
  );
}
