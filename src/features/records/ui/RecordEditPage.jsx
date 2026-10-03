/**
 * Record Edit — edit an existing DRAFT Record in place.
 *
 * Trust boundary (Step 14 audit finding):
 * - DRAFT data/entityReferences updates are allowed client-side by
 *   Firestore Rules (Record data is frozen once the status leaves DRAFT).
 * - This page uses the existing RecordService.updateDraftRecord path only.
 * - It never creates a new Record, never touches immutable provenance
 *   fields, and marks non-DRAFT Records as read-only.
 * - DRAFT → SUBMITTED is intentionally NOT offered here: Rules keep
 *   `submittedBy` immutable for client updates, so a trusted submit
 *   command is required (Step 15 Record Command/Lifecycle work).
 *
 * Autosave: debounced writes update the SAME DRAFT Record (never creates).
 * Visible states: Unsaved changes → Saving… → Saved · <time> / Save failed.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { userActor } from '../../../core/data/actorRef.js';
import { FormRenderer } from '../../../modules/forms/FormRenderer.jsx';
import { extractEntityReferences } from '../../../modules/forms/formSchemaValidator.js';
import services from '../../../infrastructure/services.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import { useRecordWithSchema } from '../hooks/useRecordWithSchema.js';
import { canEditRecordDraft, getRecordDisplayLabel } from '../model.js';
import { Badge } from '../../../design-system/index.js';

const AUTOSAVE_DELAY_MS = 1200;

const SAVE_STATES = {
  IDLE: 'idle',
  DIRTY: 'dirty',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
};

export default function RecordEditPage() {
  const { recordId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.uid || user?.userId;
  const actor = user ? userActor(userId) : null;

  const { record, mod, fields, schemaSource, loading, error } =
    useRecordWithSchema(workspaceId, recordId);

  const title = useMemo(
    () => (record ? getRecordDisplayLabel(record, fields, mod) : ''),
    [record, fields, mod],
  );

  const [saveState, setSaveState] = useState(SAVE_STATES.IDLE);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debounceRef = useRef(null);
  const latestValues = useRef(null);

  const persist = useCallback(async (values) => {
    if (!workspaceId || !recordId || !actor) return;
    setSaveState(SAVE_STATES.SAVING);
    setSaveError(null);
    try {
      const cleanValues = {};
      for (const [key, val] of Object.entries(values || {})) {
        if (val !== undefined && val !== '') cleanValues[key] = val;
      }
      const entityReferences = extractEntityReferences(cleanValues, fields);
      await services?.record?.updateDraftRecord(workspaceId, recordId, {
        data: cleanValues,
        entityReferences,
      }, actor);
      workspaceQueryCache.invalidate(`${workspaceId}:records:`);
      workspaceQueryCache.invalidate(`${workspaceId}:dashboardRecords:`);
      setLastSavedAt(new Date());
      setSaveState(SAVE_STATES.SAVED);
    } catch (err) {
      setSaveError(err.message || 'Save failed');
      setSaveState(SAVE_STATES.ERROR);
    }
  }, [workspaceId, recordId, actor, fields]);

  const handleValuesChange = useCallback((values) => {
    latestValues.current = values;
    setSaveState(SAVE_STATES.DIRTY);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(latestValues.current);
    }, AUTOSAVE_DELAY_MS);
  }, [persist]);

  const handleManualSave = useCallback(async (values) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    latestValues.current = values;
    await persist(values);
  }, [persist]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

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
        <Link to="/app/records" className="text-primary-600 text-sm hover:underline">Back to Records</Link>
      </div>
    );
  }

  if (!canEditRecordDraft(record)) {
    return (
      <div className="p-6 max-w-2xl">
        <Link to={`/app/records/${record.recordId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
          &larr; Back to Record
        </Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-amber-800 mb-2">This Record can no longer be edited</h1>
          <p className="text-sm text-amber-700">
            Only DRAFT Records are editable. This Record is {record.status}; its business
            data is frozen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link to={`/app/records/${record.recordId}`} className="text-sm text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to Record
      </Link>

      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-neutral-900 break-words">{title}</h1>
        <Badge variant="default">DRAFT</Badge>
      </div>
      <p className="text-sm text-neutral-500 mb-2">
        You are editing a draft of {mod?.name ? `"${mod.name}"` : 'this Module'}.
        Changes update the same Draft Record — no new Record is created.
      </p>

      <DraftSaveIndicator state={saveState} error={saveError} lastSavedAt={lastSavedAt} onRetry={() => persist(latestValues.current)} />

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {fields.length === 0 && (
        <div className="p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          No historical form schema is available for this Draft, so it cannot be edited.
        </div>
      )}

      {schemaSource === 'current' && record.moduleVersion && (
        <p className="text-xs text-amber-500 mb-4">
          Historical Version {record.moduleVersion} schema not found — editing with the current Module schema.
        </p>
      )}

      {fields.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <FormRenderer
            schema={{ fields }}
            initialValues={record.data}
            workspaceId={workspaceId}
            onSubmit={handleManualSave}
            onValuesChange={handleValuesChange}
            validateOnSubmit={false}
            submitLabel="Save changes"
            fieldServices={{ loadEntities: services?.entity?.listEntities }}
          />
        </div>
      )}
    </div>
  );
}

function DraftSaveIndicator({ state, error, lastSavedAt, onRetry }) {
  const base = 'mb-4 flex items-center gap-2 text-sm rounded-lg border px-3 py-2';
  if (state === SAVE_STATES.SAVING) {
    return <p className={`${base} border-neutral-200 bg-neutral-50 text-neutral-600`} role="status">Saving…</p>;
  }
  if (state === SAVE_STATES.SAVED) {
    const time = lastSavedAt
      ? lastSavedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';
    return <p className={`${base} border-green-200 bg-green-50 text-green-700`} role="status">All changes saved{time ? ` · ${time}` : ''}</p>;
  }
  if (state === SAVE_STATES.ERROR) {
    return (
      <div className={`${base} border-red-200 bg-red-50 text-red-700`} role="alert">
        <span>Save failed — {error}</span>
        <button type="button" onClick={onRetry} className="font-medium underline">
          Retry
        </button>
      </div>
    );
  }
  if (state === SAVE_STATES.DIRTY) {
    return <p className={`${base} border-neutral-200 bg-neutral-50 text-neutral-500`} role="status">Unsaved changes…</p>;
  }
  return null;
}
