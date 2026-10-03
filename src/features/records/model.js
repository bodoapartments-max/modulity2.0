import { formatDisplayValue } from '../../modules/forms/displayFormatter.js';
import { evaluateRecordAction, RECORD_ACTIONS } from '../../core/recordCommands/recordActionPolicy.js';

export function getRecordBackNavigation(fromModuleId, moduleDefinition) {
  if (moduleDefinition && fromModuleId === moduleDefinition.moduleId) return { to: `/app/modules/${moduleDefinition.moduleId}/records`, label: `Back to ${moduleDefinition.name} Records` };
  return { to: '/app/records', label: 'Back to Records' };
}

const LABEL_FIELD_TYPES = new Set(['text', 'email', 'phone', 'url', 'select', 'textarea']);
const MAX_LABEL_LENGTH = 80;

/**
 * Derives a human-readable label for a Record without mutating inputs.
 * Order: configured primary field → first text-like schema field → fallback.
 */
export function getRecordDisplayLabel(record, fields = [], moduleDefinition = null) {
  const data = record?.data || {};
  const primaryKey = moduleDefinition?.displayConfig?.primaryField;
  if (primaryKey) {
    const primaryValue = data[primaryKey];
    if (typeof primaryValue === 'string' && primaryValue.trim()) return truncateLabel(primaryValue.trim());
    if (typeof primaryValue === 'number') return String(primaryValue);
  }
  for (const field of fields) {
    if (!LABEL_FIELD_TYPES.has(field?.type)) continue;
    const value = data[field.key];
    if (typeof value === 'string' && value.trim()) return truncateLabel(value.trim());
  }
  const base = moduleDefinition?.name || record?.recordType || 'Record';
  return `${base} · ${String(record?.recordId || '').slice(0, 8)}`;
}

function truncateLabel(text) {
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH)}…` : text;
}

const STATUS_VARIANTS = {
  DRAFT: 'default',
  SUBMITTED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  ARCHIVED: 'default',
};

export function getRecordStatusVariant(status) {
  return STATUS_VARIANTS[status] || 'default';
}

const PRIORITY_VARIANTS = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export function getRecordPriorityVariant(priority) {
  if (priority === null || priority === undefined) return null;
  return PRIORITY_VARIANTS[priority] || 'default';
}

/** Only DRAFT Records may be edited (RecordService + Firestore Rules agree). */
export function canEditRecordDraft(record) {
  return record?.status === 'DRAFT';
}

/**
 * Centralized Record action discovery for UI. Uses the shared pure Record
 * Action Policy — server re-evaluates authoritatively on every command.
 * This decides which action controls to SHOW; it is never authorization.
 *
 * @param {Object|null} record
 * @param {Object|null} mod — the Record's source Module
 * @param {Object} actorContext — { authenticated, workspaceAccess }
 * @returns {Array<{ action: string, enabled: boolean, reasonCode: string|null }>}
 */
export function getAvailableRecordActions(record, mod, actorContext) {
  const actions = [
    RECORD_ACTIONS.EDIT_DRAFT,
    RECORD_ACTIONS.SUBMIT_RECORD,
    RECORD_ACTIONS.ARCHIVE_RECORD,
    RECORD_ACTIONS.RESTORE_RECORD,
    RECORD_ACTIONS.CANCEL_RECORD,
  ];
  return actions.map((action) => {
    // An already-archived Record must not SHOW "Archive" even though the
    // command itself is an idempotent no-op on the server.
    if (action === RECORD_ACTIONS.ARCHIVE_RECORD && record?.status === 'ARCHIVED') {
      return { action, enabled: false, reasonCode: 'ALREADY_IN_STATE' };
    }
    const result = evaluateRecordAction({ actorContext, record, module: mod, action });
    return { action, enabled: result.allowed, reasonCode: result.reasonCode };
  });
}

/**
 * Formats an actor reference for display. Cross-user Person profiles are not
 * readable by Firestore Rules (`users/{uid}` is owner-only), so other users
 * resolve to a truncated ID rather than a name — this is intentional.
 */
export function formatActorLabel(actorRef, currentUserId) {
  if (!actorRef) return '—';
  if (actorRef.actorId === currentUserId) return 'You';
  switch (actorRef.actorType) {
    case 'USER':
      return `User ${String(actorRef.actorId || '').slice(0, 8)}`;
    case 'INTERNAL_AGENT':
      return 'Agent';
    case 'EXTERNAL_INTEGRATION':
      return 'Integration';
    default:
      return '—';
  }
}

export const RECORD_SORT_OPTIONS = Object.freeze([
  Object.freeze({ value: 'newest', label: 'Newest first', sortField: 'createdAt', sortDirection: 'desc' }),
  Object.freeze({ value: 'oldest', label: 'Oldest first', sortField: 'createdAt', sortDirection: 'asc' }),
  Object.freeze({ value: 'updated', label: 'Recently updated', sortField: 'updatedAt', sortDirection: 'desc' }),
]);

/** Whitelist resolver — never pass raw UI strings to the query layer. */
export function resolveRecordSort(value) {
  return RECORD_SORT_OPTIONS.find((option) => option.value === value) || RECORD_SORT_OPTIONS[0];
}

/**
 * Client-side search over the loaded page only. Matches the display label,
 * recordId, recordType, referenceNumber, and any string value in record.data.
 */
export function filterRecordsBySearch(records, term, labelFor) {
  const normalized = (term || '').trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((record) => {
    if (labelFor(record)?.toLowerCase().includes(normalized)) return true;
    if (record.recordId?.toLowerCase().includes(normalized)) return true;
    if (record.recordType?.toLowerCase().includes(normalized)) return true;
    if (record.referenceNumber?.toLowerCase?.().includes(normalized)) return true;
    return Object.values(record.data || {}).some(
      (value) => typeof value === 'string' && value.toLowerCase().includes(normalized),
    );
  });
}

/**
 * Builds copy-payload values for "copy record" style flows: only keys present
 * in the current schema and not file references. By construction this never
 * carries recordId/workspaceId/actor/status/priority/ledger/system fields,
 * because those never appear as form schema field keys.
 */
export function buildRecordCopyValues(record, currentFields) {
  const result = {};
  const data = record?.data || {};
  for (const field of currentFields || []) {
    if (!field?.key || field.type === 'file-reference') continue;
    const value = data[field.key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      result[field.key] = structuredClone(value);
    } else {
      result[field.key] = value;
    }
  }
  return result;
}

/**
 * Builds a safe, portable export object for a single Record. Contains no raw
 * actor UIDs beyond truncated labels, no `_`-prefixed fields, and no
 * entityReferenceIds index array.
 */
export function buildRecordExport(record, fields, { moduleName = null, entityNames = {}, currentUserId = null } = {}) {
  const data = record?.data || {};
  return {
    exportedAt: new Date().toISOString(),
    record: {
      recordId: record?.recordId ?? null,
      recordType: record?.recordType ?? null,
      status: record?.status ?? null,
      priority: record?.priority ?? null,
      moduleId: record?.moduleId ?? null,
      moduleName,
      moduleVersion: record?.moduleVersion ?? null,
      referenceNumber: record?.referenceNumber ?? null,
      createdAt: record?.createdAt ?? null,
      updatedAt: record?.updatedAt ?? null,
      submittedAt: record?.submittedAt ?? null,
      createdBy: formatActorLabel(record?.createdBy, currentUserId),
      submittedBy: formatActorLabel(record?.submittedBy, currentUserId),
    },
    fields: (fields || [])
      .filter((field) => field?.key && !field.key.startsWith('_'))
      .map((field) => ({
        key: field.key,
        label: field.label ?? field.key,
        type: field.type ?? null,
        value: data[field.key] ?? null,
        display: formatDisplayValue(data[field.key], field, { entityNames }),
      })),
  };
}
