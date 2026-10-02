/**
 * Modulity 2.0 — Audit Action Registry
 *
 * Stable, extensible action names for the durable Audit Engine.
 * These are NOT free-text strings — they form a controlled vocabulary.
 *
 * Audit != Event Bus. The Event Bus is runtime reactions/notifications.
 * Audit is permanent accountability history.
 *
 * @module core/audit/auditActions
 */

export const AUDIT_ACTIONS = Object.freeze({
  // Record lifecycle
  RECORD_CREATED: 'record.created',
  RECORD_SUBMITTED: 'record.submitted',
  RECORD_ARCHIVED: 'record.archived',
  RECORD_UNARCHIVED: 'record.unarchived',
  RECORD_PRIORITY_CHANGED: 'record.priority_changed',
  RECORD_CANCELLED: 'record.cancelled',

  // Form Request lifecycle
  FORM_REQUEST_CREATED: 'form_request.created',
  FORM_REQUEST_OPENED: 'form_request.opened',
  FORM_REQUEST_COMPLETED: 'form_request.completed',
  FORM_REQUEST_CANCELLED: 'form_request.cancelled',
  FORM_REQUEST_DECLINED: 'form_request.declined',

  // Delivery lifecycle
  DELIVERY_CREATED: 'delivery.created',
  DELIVERY_OPENED: 'delivery.opened',
  DELIVERY_ACCEPTED: 'delivery.accepted',
  DELIVERY_DECLINED: 'delivery.declined',
  DELIVERY_REVOKED: 'delivery.revoked',

  // Ledger lifecycle
  LEDGER_BOOK_CREATED: 'ledger.book_created',
  LEDGER_BOOK_CLOSED: 'ledger.book_closed',
  LEDGER_BLOCK_OPENED: 'ledger.block_opened',
  LEDGER_ENTRY_REGISTERED: 'ledger.entry_registered',
  LEDGER_ENTRY_CANCELLED: 'ledger.entry_cancelled',
  LEDGER_ENTRY_VOIDED: 'ledger.entry_voided',

  // Module lifecycle
  MODULE_CREATED: 'module.created',
  MODULE_ACTIVATED: 'module.activated',
  MODULE_VERSION_PUBLISHED: 'module.version_published',
  MODULE_ARCHIVED: 'module.archived',

  // Entity lifecycle
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
  ENTITY_ARCHIVED: 'entity.archived',
});

/** All valid action strings for validation. */
export const VALID_AUDIT_ACTIONS = Object.freeze(Object.values(AUDIT_ACTIONS));

/**
 * Validates an audit action string.
 * @param {string} action
 * @returns {boolean}
 */
export function isValidAuditAction(action) {
  return VALID_AUDIT_ACTIONS.includes(action);
}

/**
 * Resource types that can appear in audit entries.
 */
export const AUDIT_RESOURCE_TYPES = Object.freeze({
  RECORD: 'RECORD',
  FORM_REQUEST: 'FORM_REQUEST',
  DELIVERY: 'DELIVERY',
  LEDGER_BOOK: 'LEDGER_BOOK',
  LEDGER_ENTRY: 'LEDGER_ENTRY',
  MODULE: 'MODULE',
  ENTITY: 'ENTITY',
  ENTITY_TYPE: 'ENTITY_TYPE',
});

/**
 * Audit entry sources.
 */
export const AUDIT_SOURCES = Object.freeze({
  WEB: 'web',
  API: 'api',
  AGENT: 'agent',
  SYSTEM: 'system',
});
