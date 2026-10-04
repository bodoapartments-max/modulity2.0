/**
 * Historical Form Viewer — read-only dialog for one canonical Ledger entry.
 *
 * CRITICAL INVARIANT: the historical form renders using the EXACT Module
 * Version that produced the registered Record (via record.moduleId +
 * record.moduleVersion), never the current Module schema.
 *
 * Navigation order = deterministic Ledger sequence (ascending sequence
 * number) within the loaded block entries. The viewer never edits anything:
 * FormRenderer runs with disabled + hideActions.
 */
import { useMemo } from 'react';
import Dialog from '../../../design-system/components/Dialog/Dialog.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import { FormRenderer } from '../../../modules/forms/FormRenderer.jsx';
import { formatDisplayValue } from '../../../modules/forms/displayFormatter.js';
import { useRecordWithSchema } from '../../records/hooks/useRecordWithSchema.js';
import { sortEntriesForViewer, viewerPositionLabel } from '../model.js';
import services from '../../../infrastructure/services.js';

export default function HistoricalFormViewer({
  open,
  onClose,
  workspaceId,
  entry,
  blockEntries = [],
  onNavigate,
}) {
  const recordId = entry?.recordId ?? null;
  const { record, mod, fields, schemaSource, entityNames, loading, error } =
    useRecordWithSchema(open ? workspaceId : null, recordId);

  const ordered = useMemo(() => sortEntriesForViewer(blockEntries), [blockEntries]);
  const index = ordered.findIndex((item) => item.ledgerEntryId === entry?.ledgerEntryId);
  const position = viewerPositionLabel(entry, ordered);
  const isVoided = entry && entry.entryStatus !== 'ACTIVE';

  if (!open || !entry) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${entry.referenceNumber}`}
      className="max-w-2xl"
    >
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {isVoided && <Badge variant="danger">{entry.entryStatus}</Badge>}
          {mod?.name && <span className="text-sm font-medium text-neutral-700">{mod.name}</span>}
          {record?.moduleVersion && <Badge variant="default">v{record.moduleVersion}</Badge>}
          {schemaSource === 'historical' && record?.moduleVersion && (
            <span className="text-xs text-neutral-400">Schema Version {record.moduleVersion}</span>
          )}
          {schemaSource === 'current' && (
            <span className="text-xs text-amber-600">Historical schema unavailable — current schema used</span>
          )}
        </div>
        {position && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-500">
            {position}
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        Read-only historical form. Values are the canonical Record — nothing here can be edited.
      </p>

      {loading ? (
        <div className="animate-pulse space-y-3 py-4">
          <div className="h-4 w-32 bg-neutral-100 rounded" />
          <div className="h-4 w-48 bg-neutral-100 rounded" />
        </div>
      ) : error ? (
        <div role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      ) : !record ? (
        <p className="text-sm text-neutral-500">The referenced Record is not accessible.</p>
      ) : fields.length > 0 ? (
        <div data-testid="historical-form">
          <FormRenderer
            schema={{ fields }}
            initialValues={record.data}
            workspaceId={workspaceId}
            onSubmit={() => {}}
            disabled
            hideActions
            fieldServices={{ loadEntities: services?.entity?.listEntities }}
          />
          {record.entityReferences?.length > 0 && (
            <div className="mt-3 border-t border-neutral-200 pt-3 space-y-1">
              {record.entityReferences.map((ref) => (
                <div key={`${ref.entityTypeId}:${ref.entityId}`} className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">{ref.entityTypeId}:</span>
                  <span className="font-medium text-neutral-800">
                    {entityNames[ref.entityId] || `${ref.entityId} (unavailable)`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {isVoided && (
            <p className="mt-3 text-xs text-red-600">
              This form entry is {String(entry.entryStatus).toLowerCase()} — its sequence stays consumed permanently.
            </p>
          )}
        </div>
      ) : (
        // Fallback for historical schema unavailable: label/value rendering
        <div className="space-y-2">
          {Object.entries(record.data || {}).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2 border-b border-neutral-100 py-1.5 text-sm">
              <span className="text-neutral-500">{key}</span>
              <span className="font-medium">{formatDisplayValue(value, { type: 'text', key }, {})}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index <= 0}
          onClick={() => onNavigate?.(ordered[index - 1])}
          aria-label="Previous entry"
        >
          ← Previous
        </Button>
        <span className="text-xs text-neutral-400">
          {index >= 0 ? `${index + 1} of ${ordered.length}` : ''}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index < 0 || index >= ordered.length - 1}
          onClick={() => onNavigate?.(ordered[index + 1])}
          aria-label="Next entry"
        >
          Next →
        </Button>
      </div>
    </Dialog>
  );
}
