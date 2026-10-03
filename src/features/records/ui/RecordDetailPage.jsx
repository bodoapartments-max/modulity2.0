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
 * - "Edit draft" updates DRAFT data/entityReferences via the client-side
 *   RecordService path (allowed by Firestore Rules, DRAFT-only).
 * - "Create copy" only PREFILLS a Module form; the new Record is created
 *   through the trusted recordCommand CREATE_RECORD path.
 */
import { useCallback, useMemo } from 'react';
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
  canEditRecordDraft,
  buildRecordCopyValues,
  buildRecordExport,
} from '../model.js';
import { Badge, Button } from '../../../design-system/index.js';

export default function RecordDetailPage() {
  const { recordId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.uid || user?.userId;

  const workspaceId = currentWorkspace?.workspaceId;
  const { record, mod, fields, schemaSource, entityNames, loading, error } =
    useRecordWithSchema(workspaceId, recordId);

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
          {canEditRecordDraft(record) && (
            <Link to={`/app/records/${record.recordId}/edit`}>
              <Button type="button" variant="primary" size="sm">Edit draft</Button>
            </Link>
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
        </div>

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

      {/* Record History (Audit Trail) — from the canonical Audit Service */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">History</h2>
        <RecordHistory workspaceId={workspaceId} recordId={recordId} />
        <p className="no-print mt-3 text-xs text-neutral-400">
          Full trusted Ledger/Audit backend is a separate roadmap milestone; this view reads
          the durable audit entries that exist today.
        </p>
      </div>
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
