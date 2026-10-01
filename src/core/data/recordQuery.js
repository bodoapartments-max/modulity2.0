/**
 * Modulity 2.0 — Record Query Contract
 *
 * Provider-independent query parameters for Record listing and searching.
 * Used by RecordQueryService and Firestore repository implementations.
 *
 * @module core/data/recordQuery
 */

export const RECORD_BUCKETS = Object.freeze({
  ALL: 'ALL',
  OWN: 'OWN',
  RECEIVED: 'RECEIVED',
  SENT: 'SENT',
  SAVED: 'SAVED',
  STARRED: 'STARRED',
  ARCHIVED: 'ARCHIVED',
});

export const SORT_FIELDS = Object.freeze({
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  SUBMITTED_AT: 'submittedAt',
  STATUS: 'status',
  PRIORITY: 'priority',
  RECORD_TYPE: 'recordType',
});

export const SORT_DIRECTIONS = Object.freeze({
  ASC: 'asc',
  DESC: 'desc',
});

/**
 * @typedef {Object} RecordQueryParams
 * @property {string} workspaceId — required workspace scope
 * @property {string|null} userId — user context for user-aware queries (OWN, STARRED, etc.)
 * @property {string|null} moduleId — optional module scope filter
 * @property {string} bucket — one of RECORD_BUCKETS (default: ALL)
 * @property {string|null} status — status filter
 * @property {string|null} priority — priority filter
 * @property {string|null} recordType — recordType filter
 * @property {string|null} createdFrom — inclusive lower bound (ISO string)
 * @property {string|null} createdTo — inclusive upper bound (ISO string)
 * @property {string} sortField — one of SORT_FIELDS (default: createdAt)
 * @property {string} sortDirection — one of SORT_DIRECTIONS (default: desc)
 * @property {*} startAfter — Firestore-compatible cursor for pagination (opaque)
 * @property {number} limit — page size (default: 25, max: 100)
 */

/**
 * Creates a validated RecordQueryParams object.
 *
 * Normalizes ARCHIVED bucket: if bucket === ARCHIVED and status is separately
 * set to something else, the ARCHIVED bucket takes precedence (status forced to ARCHIVED).
 *
 * @param {Object} params
 * @returns {RecordQueryParams}
 */
export function createRecordQuery({
  workspaceId,
  userId = null,
  moduleId = null,
  bucket = RECORD_BUCKETS.ALL,
  status = null,
  priority = null,
  recordType = null,
  createdFrom = null,
  createdTo = null,
  sortField = SORT_FIELDS.CREATED_AT,
  sortDirection = SORT_DIRECTIONS.DESC,
  startAfter = null,
  limit = 25,
}) {
  if (!workspaceId) throw new Error('workspaceId is required for record queries');
  if (bucket && !RECORD_BUCKETS[bucket]) {
    throw new Error(`Invalid record bucket: ${bucket}`);
  }
  if (sortField && !Object.values(SORT_FIELDS).includes(sortField)) {
    throw new Error(`Invalid sort field: ${sortField}`);
  }
  if (sortDirection && !SORT_DIRECTIONS[sortDirection.toUpperCase()]) {
    throw new Error(`Invalid sort direction: ${sortDirection}`);
  }
  const parsedLimit = Number(limit);
  const clampedLimit = Math.max(1, Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 25));

  // ARCHIVED normalization: ARCHIVED bucket overrides any conflicting status filter
  const resolvedBucket = bucket || RECORD_BUCKETS.ALL;
  const resolvedStatus = resolvedBucket === RECORD_BUCKETS.ARCHIVED ? 'ARCHIVED' : status;

  return Object.freeze({
    workspaceId,
    userId,
    moduleId,
    bucket: resolvedBucket,
    status: resolvedStatus,
    priority,
    recordType,
    createdFrom: createdFrom || null,
    createdTo: createdTo || null,
    sortField: sortField || SORT_FIELDS.CREATED_AT,
    sortDirection: sortDirection || SORT_DIRECTIONS.DESC,
    startAfter,
    limit: clampedLimit,
  });
}

/**
 * @typedef {Object} PaginatedResult
 * @property {Array} items — the result records
 * @property {*} nextCursor — opaque cursor for next page (null if no more)
 * @property {boolean} hasMore — whether more results exist
 */

/**
 * Creates a PaginatedResult envelope.
 *
 * @param {Array} items
 * @param {*} nextCursor
 * @param {boolean} hasMore
 * @returns {PaginatedResult}
 */
export function createPaginatedResult(items, nextCursor = null, hasMore = false) {
  return Object.freeze({
    items: Object.freeze([...items]),
    nextCursor,
    hasMore,
  });
}
