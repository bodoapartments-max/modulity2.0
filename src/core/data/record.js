/**
 * Modulity 2.0 — Record
 *
 * The canonical business transaction/event/form submission.
 * One form submission creates ONE canonical Record.
 * All views (List, Table, Ledger, Widget, Report) are projections.
 *
 * ENTITY != RECORD != MODULE
 *
 * @module core/data/record
 */

export const RECORD_STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
});

export const RECORD_PRIORITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

/**
 * @typedef {Object} Record
 * @property {string} recordId
 * @property {string} workspaceId
 * @property {string|null} moduleId       — which module created it (null for non-module records)
 * @property {number|null} moduleVersion  — exact Module version used when Record was created (immutable)
 * @property {string} recordType          — machine identifier for the record kind
 * @property {string} status
 * @property {string|null} priority
 * @property {Object} createdBy           — ActorRef
 * @property {Object|null} submittedBy    — ActorRef
 * @property {Object} data                — validated form payload
 * @property {import('./entity.js').EntityReference[]} entityReferences — canonical references (source of truth)
 * @property {string[]} entityReferenceIds — derived from entityReferences for array-contains queries (index only)
 * @property {string[]} attachments       — file IDs
 * @property {string[]} createdEntityIds  — entity IDs created from this record
 * @property {string|null} sourceRequestId — FormRequest that produced this Record (null for normal submissions, immutable)
 * @property {string|null} ledgerEntryId — LedgerEntry for this Record (null if not registered, immutable after set)
 * @property {string|null} ledgerBookId — LedgerBook this Record is registered in (immutable after set)
 * @property {string|null} referenceNumber — human-readable Ledger reference (immutable after set)
 * @property {string} schemaVersion
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} submittedAt
 */

/**
 * Creates a Record value object.
 *
 * @param {Object} params
 * @returns {Record}
 */
export function createRecord({
  recordId,
  workspaceId,
  moduleId = null,
  moduleVersion = null,
  recordType,
  status = RECORD_STATUSES.DRAFT,
  priority = null,
  createdBy,
  submittedBy = null,
  data = {},
  entityReferences = [],
  entityReferenceIds = [],
  attachments = [],
  createdEntityIds = [],
  sourceRequestId = null,
  ledgerEntryId = null,
  ledgerBookId = null,
  referenceNumber = null,
  schemaVersion = '1.0.0',
  createdAt,
  updatedAt,
  submittedAt = null,
}) {
  if (!recordId) throw new Error('recordId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!recordType) throw new Error('recordType is required');
  if (!RECORD_STATUSES[status]) {
    throw new Error(`Invalid record status: ${status}`);
  }
  if (priority !== null && !RECORD_PRIORITIES[priority]) {
    throw new Error(`Invalid record priority: ${priority}`);
  }
  if (!createdBy) throw new Error('createdBy is required');
  if (!Array.isArray(entityReferences)) {
    throw new Error('entityReferences must be an array');
  }
  // moduleVersion must be a positive integer when moduleId is present
  if (moduleId && moduleVersion !== null && moduleVersion !== undefined) {
    if (typeof moduleVersion !== 'number' || !Number.isInteger(moduleVersion) || moduleVersion < 1) {
      throw new Error('moduleVersion must be a positive integer');
    }
  }

  return Object.freeze({
    recordId,
    workspaceId,
    moduleId,
    moduleVersion: moduleId ? (moduleVersion ?? null) : null,
    recordType,
    status,
    priority,
    createdBy: Object.freeze({ ...createdBy }),
    submittedBy: submittedBy ? Object.freeze({ ...submittedBy }) : null,
    data: Object.freeze({ ...data }),
    entityReferences: Object.freeze(
      entityReferences.map((r) => Object.freeze({ ...r })),
    ),
    entityReferenceIds: Object.freeze([...entityReferenceIds]),
    attachments: Object.freeze([...attachments]),
    createdEntityIds: Object.freeze([...createdEntityIds]),
    sourceRequestId,
    ledgerEntryId,
    ledgerBookId,
    referenceNumber,
    schemaVersion,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
    submittedAt,
  });
}
