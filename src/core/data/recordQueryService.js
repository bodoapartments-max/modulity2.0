/**
 * Modulity 2.0 — Record Query Service
 *
 * Handles paginated, filtered, sorted Record queries.
 * Supports Global List, Module-scoped List, and bucket queries.
 *
 * This is SEPARATE from RecordService to avoid monolith.
 * RecordService = CRUD + lifecycle. RecordQueryService = read-only queries.
 *
 * BUCKET QUERY SEMANTICS (Step 5.1):
 *   - ALL, OWN, ARCHIVED: resolved directly via records collection (Firestore)
 *   - STARRED: resolved via userRecordStateRepo → bounded fetch of starred Records
 *   - SENT: resolved via deliveryRepo.listBySender → bounded fetch of sent Records
 *   - RECEIVED: resolved via deliveryRepo.listByRecipient → bounded fetch of received Records
 *
 * These are REAL query semantics, not UI labels over ALL records.
 *
 * @module core/data/recordQueryService
 */

import { createRecordQuery, RECORD_BUCKETS, createPaginatedResult } from './recordQuery.js';
import { AppError } from '../errors/appError.js';

/** Max Records to resolve from collaboration bucket two-step queries. */
const COLLABORATION_BUCKET_LIMIT = 200;

/**
 * @param {Object} deps
 * @param {Object} deps.recordRepo — must implement paginatedQuery(workspaceId, queryParams)
 * @param {Object} deps.deliveryRepo — for SENT/RECEIVED bucket queries
 * @param {Object} deps.userRecordStateRepo — for STARRED bucket queries
 */
export function createRecordQueryService({ recordRepo, deliveryRepo = null, userRecordStateRepo = null }) {
  /**
   * Executes a paginated record query.
   *
   * For most buckets (ALL, OWN, ARCHIVED), queries go directly to the records collection.
   * For collaboration buckets (SENT, RECEIVED, STARRED), the service first resolves
   * relevant recordIds from collaboration collections, then fetches the records.
   *
   * @param {Object} params — raw query parameters
   * @returns {Promise<import('./recordQuery.js').PaginatedResult>}
   */
  async function queryRecords(params) {
    const query = createRecordQuery(params);

    switch (query.bucket) {
      case RECORD_BUCKETS.STARRED:
        return queryStarredRecords(query);
      case RECORD_BUCKETS.SENT:
        return querySentRecords(query);
      case RECORD_BUCKETS.RECEIVED:
        return queryReceivedRecords(query);
      default:
        return queryDirectRecords(query);
    }
  }

  /**
   * Direct query against records collection.
   * Handles ALL, OWN, SAVED, ARCHIVED buckets.
   */
  async function queryDirectRecords(query) {
    if (!recordRepo.paginatedQuery) {
      // Fallback for repos without pagination support
      const all = await recordRepo.query(query.workspaceId, buildSimpleFilters(query));
      return createPaginatedResult(all, null, false);
    }
    return recordRepo.paginatedQuery(query.workspaceId, query);
  }

  /**
   * Queries starred records via user record state.
   * Two-step bounded query: get starred IDs, then fetch Records.
   */
  async function queryStarredRecords(query) {
    if (!query.userId) {
      throw new AppError('validation_error', 'userId is required for STARRED bucket');
    }
    if (!userRecordStateRepo) {
      return createPaginatedResult([], null, false);
    }
    const starredIds = await userRecordStateRepo.getStarredRecordIds(
      query.workspaceId, query.userId,
    );
    if (starredIds.length === 0) {
      return createPaginatedResult([], null, false);
    }
    // Bound the resolution to prevent loading an unbounded set
    const boundedIds = starredIds.slice(0, COLLABORATION_BUCKET_LIMIT);
    const records = await Promise.all(
      boundedIds.map((id) => recordRepo.getById(query.workspaceId, id)),
    );
    const filtered = applyClientFilters(records.filter(Boolean), query);
    return createPaginatedResult(filtered, null, filtered.length >= COLLABORATION_BUCKET_LIMIT);
  }

  /**
   * Queries records sent by the user.
   * Two-step bounded query: get sent delivery recordIds, then fetch Records.
   */
  async function querySentRecords(query) {
    if (!query.userId) {
      throw new AppError('validation_error', 'userId is required for SENT bucket');
    }
    if (!deliveryRepo) {
      return createPaginatedResult([], null, false);
    }
    const deliveries = await deliveryRepo.listBySender(query.workspaceId, query.userId);
    const recordIds = [...new Set(deliveries.map((d) => d.recordId))].slice(0, COLLABORATION_BUCKET_LIMIT);
    if (recordIds.length === 0) {
      return createPaginatedResult([], null, false);
    }
    const records = await Promise.all(
      recordIds.map((id) => recordRepo.getById(query.workspaceId, id)),
    );
    const result = applyClientFilters(records.filter(Boolean), query);
    return createPaginatedResult(result, null, result.length >= COLLABORATION_BUCKET_LIMIT);
  }

  /**
   * Queries records received by the user.
   * Two-step bounded query: get received delivery recordIds, then fetch Records.
   */
  async function queryReceivedRecords(query) {
    if (!query.userId) {
      throw new AppError('validation_error', 'userId is required for RECEIVED bucket');
    }
    if (!deliveryRepo) {
      return createPaginatedResult([], null, false);
    }
    const deliveries = await deliveryRepo.listByRecipient(query.workspaceId, query.userId);
    const recordIds = [...new Set(deliveries.map((d) => d.recordId))].slice(0, COLLABORATION_BUCKET_LIMIT);
    if (recordIds.length === 0) {
      return createPaginatedResult([], null, false);
    }
    const records = await Promise.all(
      recordIds.map((id) => recordRepo.getById(query.workspaceId, id)),
    );
    const result = applyClientFilters(records.filter(Boolean), query);
    return createPaginatedResult(result, null, result.length >= COLLABORATION_BUCKET_LIMIT);
  }

  /**
   * Builds simple filter object for legacy query fallback.
   */
  function buildSimpleFilters(query) {
    const filters = {};
    if (query.status) filters.status = query.status;
    if (query.recordType) filters.recordType = query.recordType;
    if (query.moduleId) filters.moduleId = query.moduleId;
    if (query.bucket === RECORD_BUCKETS.OWN && query.userId) {
      filters.createdByUserId = query.userId;
    }
    return filters;
  }

  /**
   * Client-side filters for collaboration buckets where the server query
   * already narrowed results by recordId. Also handles date range filtering
   * for collaboration bucket results.
   */
  function applyClientFilters(records, query) {
    let result = [...records];
    if (query.status) {
      result = result.filter((r) => r.status === query.status);
    }
    if (query.priority) {
      result = result.filter((r) => r.priority === query.priority);
    }
    if (query.moduleId) {
      result = result.filter((r) => r.moduleId === query.moduleId);
    }
    if (query.recordType) {
      result = result.filter((r) => r.recordType === query.recordType);
    }
    // Date range filters for collaboration bucket results
    if (query.createdFrom) {
      const fromDate = new Date(query.createdFrom);
      result = result.filter((r) => r.createdAt && new Date(r.createdAt) >= fromDate);
    }
    if (query.createdTo) {
      const toDate = new Date(query.createdTo);
      result = result.filter((r) => r.createdAt && new Date(r.createdAt) <= toDate);
    }
    // Sort
    result.sort((a, b) => {
      const fieldA = a[query.sortField] || '';
      const fieldB = b[query.sortField] || '';
      const cmp = fieldA < fieldB ? -1 : fieldA > fieldB ? 1 : 0;
      return query.sortDirection === 'desc' ? -cmp : cmp;
    });
    return result;
  }

  return {
    queryRecords,
  };
}
