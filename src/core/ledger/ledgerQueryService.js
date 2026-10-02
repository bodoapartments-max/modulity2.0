/**
 * Modulity 2.0 — Ledger Query Service
 *
 * Paginated, filtered queries for Ledger Entries.
 * Default sort: sequenceNumber ascending.
 *
 * @module core/ledger/ledgerQueryService
 */

import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.ledgerEntryRepo — must have paginatedQuery()
 */
export function createLedgerQueryService({ ledgerEntryRepo }) {
  /**
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {string} params.ledgerBookId
   * @param {string} [params.ledgerBlockId]
   * @param {string} [params.moduleId]
   * @param {string} [params.recordType]
   * @param {string} [params.entryStatus]
   * @param {string} [params.referenceNumber] — exact match
   * @param {number} [params.sequenceFrom]
   * @param {number} [params.sequenceTo]
   * @param {string} [params.registeredFrom]
   * @param {string} [params.registeredTo]
   * @param {string} [params.sortField='sequenceNumber']
   * @param {string} [params.sortDirection='asc']
   * @param {*} [params.startAfter]
   * @param {number} [params.limit=25]
   */
  async function queryEntries(params) {
    if (!params.workspaceId) {
      throw new AppError('validation_error', 'workspaceId is required');
    }
    if (!params.ledgerBookId) {
      throw new AppError('validation_error', 'ledgerBookId is required');
    }
    const parsedLimit = Number(params.limit);
    const limit = Math.max(1, Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 25));
    return ledgerEntryRepo.paginatedQuery(params.workspaceId, { ...params, limit });
  }

  return { queryEntries };
}
