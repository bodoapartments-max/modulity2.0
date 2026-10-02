/**
 * Modulity 2.0 — Audit Service
 *
 * Persists durable AuditEntry records. Separate from the runtime Event Bus.
 * Event Bus = runtime reactions/notifications/integrations.
 * Audit = permanent accountability history.
 *
 * INVARIANTS:
 *   - Append-only (no update, no delete).
 *   - Server-authoritative timestamps at persistence layer.
 *   - Browser clients may only claim USER actor with own uid.
 *
 * @module core/audit/auditService
 */

import { createAuditEntry } from './auditEntry.js';
import { generateId } from '../utils/generateId.js';

/**
 * @param {Object} deps
 * @param {Object} deps.auditEntryRepo — must have create() and paginatedQuery()
 */
export function createAuditService({ auditEntryRepo }) {
  /**
   * Records a durable audit entry.
   *
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {Object} params.actor — ActorRef
   * @param {string} params.action — AUDIT_ACTIONS value
   * @param {string} params.resourceType — AUDIT_RESOURCE_TYPES value
   * @param {string} params.resourceId
   * @param {Object} [params.metadata]
   * @param {string} [params.correlationId]
   * @param {string} [params.source]
   * @param {string} [params.sourceRequestId]
   */
  async function record({
    workspaceId,
    actor,
    action,
    resourceType,
    resourceId,
    metadata = {},
    correlationId = null,
    source = 'web',
    sourceRequestId = null,
  }) {
    const entry = createAuditEntry({
      auditEntryId: generateId(),
      workspaceId,
      actor,
      action,
      resourceType,
      resourceId,
      metadata,
      correlationId: correlationId || `corr:${generateId()}`,
      source,
      sourceRequestId,
    });
    return auditEntryRepo.create(entry);
  }

  /**
   * Queries audit entries for a specific resource.
   */
  async function getResourceHistory(workspaceId, resourceType, resourceId, options = {}) {
    return auditEntryRepo.paginatedQuery(workspaceId, {
      resourceType,
      resourceId,
      sortField: 'timestamp',
      sortDirection: 'desc',
      ...options,
    });
  }

  /**
   * Queries audit entries by actor.
   */
  async function getActorHistory(workspaceId, actorId, options = {}) {
    return auditEntryRepo.paginatedQuery(workspaceId, {
      actorId,
      sortField: 'timestamp',
      sortDirection: 'desc',
      ...options,
    });
  }

  /**
   * General audit query.
   */
  async function queryAudit(workspaceId, filters = {}) {
    return auditEntryRepo.paginatedQuery(workspaceId, {
      ...filters,
      sortField: filters.sortField || 'timestamp',
      sortDirection: filters.sortDirection || 'desc',
    });
  }

  return { record, getResourceHistory, getActorHistory, queryAudit };
}
