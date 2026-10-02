/**
 * Modulity 2.0 — Audit Entry
 *
 * Immutable, append-only accountability record.
 * Durable audit history — NOT the same as the runtime Event Bus.
 *
 * INVARIANTS:
 *   - Audit Entries are append-only (no update, no delete).
 *   - Actor must match request.auth.uid for browser clients.
 *   - Timestamps are server-authoritative.
 *   - correlationId enables timeline reconstruction across related operations.
 *
 * @module core/audit/auditEntry
 */

import { isValidAuditAction, AUDIT_RESOURCE_TYPES, AUDIT_SOURCES } from './auditActions.js';

/**
 * @typedef {Object} AuditEntry
 * @property {string} auditEntryId
 * @property {string} workspaceId
 * @property {Object} actor — ActorRef (USER, INTERNAL_AGENT, EXTERNAL_INTEGRATION)
 * @property {string} action — one of AUDIT_ACTIONS values
 * @property {string} resourceType — one of AUDIT_RESOURCE_TYPES
 * @property {string} resourceId — ID of the affected resource
 * @property {string} timestamp — server-authoritative
 * @property {Object} metadata — action-specific context (identifiers, transition info)
 * @property {string|null} correlationId — links related audit entries
 * @property {string} source — one of AUDIT_SOURCES
 * @property {string|null} sourceRequestId — optional FormRequest link
 */

/**
 * Creates an AuditEntry value object.
 *
 * @param {Object} params
 * @returns {AuditEntry}
 */
export function createAuditEntry({
  auditEntryId,
  workspaceId,
  actor,
  action,
  resourceType,
  resourceId,
  timestamp,
  metadata = {},
  correlationId = null,
  source = AUDIT_SOURCES.WEB,
  sourceRequestId = null,
}) {
  if (!auditEntryId) throw new Error('auditEntryId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!actor) throw new Error('actor is required');
  if (!actor.actorType || !actor.actorId) {
    throw new Error('actor must have actorType and actorId');
  }
  if (!action) throw new Error('action is required');
  if (!isValidAuditAction(action)) {
    throw new Error(`Invalid audit action: ${action}`);
  }
  if (!resourceType) throw new Error('resourceType is required');
  if (!AUDIT_RESOURCE_TYPES[resourceType]) {
    throw new Error(`Invalid audit resource type: ${resourceType}`);
  }
  if (!resourceId) throw new Error('resourceId is required');
  if (!Object.values(AUDIT_SOURCES).includes(source)) {
    throw new Error(`Invalid audit source: ${source}`);
  }

  return Object.freeze({
    auditEntryId,
    workspaceId,
    actor: Object.freeze({ ...actor }),
    action,
    resourceType,
    resourceId,
    timestamp: timestamp || new Date().toISOString(),
    metadata: Object.freeze({ ...metadata }),
    correlationId,
    source,
    sourceRequestId,
  });
}
