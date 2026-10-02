/**
 * Modulity 2.0 — Audit Bridge
 *
 * Connects the runtime Event Bus to the durable Audit Service.
 * Listens for business events and persists corresponding AuditEntry records.
 *
 * Event Bus = runtime reactions (synchronous, in-memory, ephemeral).
 * Audit = permanent accountability history (persisted to Firestore).
 *
 * @module core/audit/auditBridge
 */

import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, AUDIT_SOURCES } from './auditActions.js';

/** Maps event bus event types to audit action + resource type. */
const EVENT_TO_AUDIT = {
  'record.created': { action: AUDIT_ACTIONS.RECORD_CREATED, resourceType: AUDIT_RESOURCE_TYPES.RECORD },
  'record.submitted': { action: AUDIT_ACTIONS.RECORD_SUBMITTED, resourceType: AUDIT_RESOURCE_TYPES.RECORD },
  'record.archived': { action: AUDIT_ACTIONS.RECORD_ARCHIVED, resourceType: AUDIT_RESOURCE_TYPES.RECORD },
  'record.unarchived': { action: AUDIT_ACTIONS.RECORD_UNARCHIVED, resourceType: AUDIT_RESOURCE_TYPES.RECORD },
  'record.priority_changed': { action: AUDIT_ACTIONS.RECORD_PRIORITY_CHANGED, resourceType: AUDIT_RESOURCE_TYPES.RECORD },
  'record.sent': { action: AUDIT_ACTIONS.DELIVERY_CREATED, resourceType: AUDIT_RESOURCE_TYPES.DELIVERY },
  'delivery.status_changed': { action: null, resourceType: AUDIT_RESOURCE_TYPES.DELIVERY }, // handled below
};

/**
 * Starts the audit bridge. Returns a cleanup function.
 *
 * @param {Object} eventBus — the event bus instance
 * @param {Object} auditService — the audit service instance
 * @returns {Function} cleanup function to unsubscribe
 */
export function startAuditBridge(eventBus, auditService) {
  if (!auditService) return () => {};

  const unsubscribe = eventBus.on('*', async (event) => {
    try {
      const mapping = EVENT_TO_AUDIT[event.eventType];
      if (!mapping) return; // Not a mapped event

      const workspaceId = event.workspaceId;
      if (!workspaceId) return;

      const actor = {
        actorType: event.actor?.type === 'user' ? 'USER' : 'INTERNAL_AGENT',
        actorId: event.actor?.id || 'unknown',
      };

      const resourceId = event.payload?.recordId || event.payload?.deliveryId || event.payload?.entityId || 'unknown';

      let action = mapping.action;
      // Special case: delivery.status_changed maps to specific actions
      if (event.eventType === 'delivery.status_changed') {
        const statusMap = {
          OPENED: AUDIT_ACTIONS.DELIVERY_OPENED,
          ACCEPTED: AUDIT_ACTIONS.DELIVERY_ACCEPTED,
          DECLINED: AUDIT_ACTIONS.DELIVERY_DECLINED,
          REVOKED: AUDIT_ACTIONS.DELIVERY_REVOKED,
        };
        action = statusMap[event.payload?.newStatus];
        if (!action) return;
      }

      if (!action) return;

      await auditService.record({
        workspaceId,
        actor,
        action,
        resourceType: mapping.resourceType,
        resourceId,
        metadata: event.payload || {},
        correlationId: event.correlationId,
        source: AUDIT_SOURCES.WEB,
      });
    } catch {
      // Audit bridge must not break the main application flow
    }
  });

  return unsubscribe;
}
