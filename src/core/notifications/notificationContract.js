/**
 * Modulity 2.0 — Generic Notification Domain (contract)
 *
 * ONE canonical notification domain — NOT a feature-specific notification
 * database per engine. Records, Ledger, Automat, Calendar, Chat, Approval,
 * Workflow, Tasks, Scheduling, Documents and Integrations request
 * notifications through this architecture.
 *
 * Notifications are DERIVED communication artifacts. They are never business
 * truth: Audit records what happened; notifications only ask for attention.
 *
 * Concepts:
 *   NotificationIntent   — "something important happened" (trusted input)
 *   NotificationTemplate — deterministic presentation per event type
 *   RecipientStrategy    — who should be notified (explicit/actor/self)
 *   Notification         — canonical user-facing artifact (server-authored)
 *   DeliveryAdapter      — IN_APP today; EMAIL/PUSH are future seams
 *
 * @module core/notifications/notificationContract
 */

export const NOTIFICATION_CONTRACT_VERSION = '1.0.0';

export const NOTIFICATION_STATUSES = Object.freeze({
  UNREAD: 'UNREAD',
  READ: 'READ',
  ARCHIVED: 'ARCHIVED',
});

export const NOTIFICATION_PRIORITIES = Object.freeze({
  NORMAL: 'NORMAL',
  ATTENTION: 'ATTENTION',
});

/**
 * Well-known event keys (controlled vocabulary — do not invent UI strings on
 * the fly; add explicit entries when a NEW meaningful user-facing event
 * appears).
 */
export const NOTIFICATION_EVENT_TYPES = Object.freeze({
  RECORD_CREATED: 'record.created',
  RECORD_DRAFT_SAVED: 'record.draft_saved',
  RECORD_SUBMITTED: 'record.submitted',
});

/**
 * Recipient resolution strategies (Step 17 minimum).
 * Explicit payloads must come only from TRUSTED server producers — the caller
 * is already authorized; this contract assumes server authorization happened.
 */
export const RECIPIENT_STRATEGIES = Object.freeze({
  /** NOTIFY the actor themselves (own action produced an inbox item). */
  SELF_FROM_ACTOR: 'SELF_FROM_ACTOR',
  /** NOTIFY a specific user id supplied by the trusted producer. */
  EXPLICIT_USER: 'EXPLICIT_USER',
});

export const NOTIFICATION_ERROR_CODES = Object.freeze({
  INTENT_INVALID: 'INTENT_INVALID',
  RECIPIENT_INVALID: 'RECIPIENT_INVALID',
  CONTEXT_INVALID: 'CONTEXT_INVALID',
});

/** Forbidden intent payload keys — server-derived authority fields. */
const FORBIDDEN_INTENT_KEYS = Object.freeze([
  'notificationId', 'status', 'readAt', 'createdAt', 'recipientUserId',
]);

export const CONTEXT_RESOURCE_TYPES = Object.freeze({
  RECORD: 'RECORD',
  MODULE: 'MODULE',
  LEDGER_ENTRY: 'LEDGER_ENTRY',
  ENTITY: 'ENTITY',
});

/**
 * Validates a NotificationIntent. No executable content, no Firestore paths,
 * no handler functions — deterministic data only.
 *
 * @param {Object} intent
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateNotificationIntent(intent) {
  const errors = [];
  if (!intent || typeof intent !== 'object') {
    return { valid: false, errors: ['Intent must be an object'], code: NOTIFICATION_ERROR_CODES.INTENT_INVALID };
  }
  if (!intent.eventType || typeof intent.eventType !== 'string') errors.push('intent.eventType is required');
  if (!intent.workspaceId || typeof intent.workspaceId !== 'string') errors.push('intent.workspaceId is required');
  if (!intent.actorUserId || typeof intent.actorUserId !== 'string') errors.push('intent.actorUserId is required');
  if (!intent.operationId || typeof intent.operationId !== 'string') errors.push('intent.operationId is required');

  for (const key of FORBIDDEN_INTENT_KEYS) {
    if (key in intent) errors.push(`intent.${key} is server-authoritative and must not be supplied`);
  }

  const strategy = intent.recipientStrategy?.type || RECIPIENT_STRATEGIES.SELF_FROM_ACTOR;
  if (!Object.values(RECIPIENT_STRATEGIES).includes(strategy)) {
    errors.push(`Unknown recipient strategy: ${strategy}`);
  }
  if (strategy === RECIPIENT_STRATEGIES.EXPLICIT_USER) {
    const userId = intent.recipientStrategy?.userId;
    if (!userId || typeof userId !== 'string') {
      errors.push('EXPLICIT_USER requires recipientStrategy.userId');
    }
  }

  const ref = intent.contextReference;
  if (ref) {
    if (!Object.values(CONTEXT_RESOURCE_TYPES).includes(ref.type)) {
      errors.push(`Unknown contextReference.type: ${ref.type}`);
    }
    if (!ref.id || typeof ref.id !== 'string') errors.push('contextReference.id is required');
    if (ref.workspaceId && ref.workspaceId !== intent.workspaceId) {
      errors.push('contextReference.workspaceId must match intent.workspaceId');
    }
  } else {
    errors.push('contextReference is required');
  }

  if (intent.metadata !== undefined && (typeof intent.metadata !== 'object' || intent.metadata === null || Array.isArray(intent.metadata))) {
    errors.push('metadata must be a plain object when present');
  }

  if (errors.length) {
    return { valid: false, errors, code: NOTIFICATION_ERROR_CODES.INTENT_INVALID };
  }
  return { valid: true, errors: [] };
}

/**
 * Deterministic canonical Notification identity.
 *
 * one logical operation + one event + one recipient
 *   → at most one canonical Notification.
 *
 * Distinct operations share only their shape, so they never collide.
 */
export function deriveNotificationId({ operationId, eventType, recipientUserId }) {
  return `op_${operationId}_${eventType}_${recipientUserId}`;
}

/**
 * Validates a canonical context reference (never copies business data).
 */
export function validateContextReference(ref) {
  if (!ref || typeof ref !== 'object') return { valid: false, errors: ['contextReference must be an object'] };
  const errors = [];
  if (!Object.values(CONTEXT_RESOURCE_TYPES).includes(ref.type)) errors.push('Unknown context type');
  if (!ref.id || typeof ref.id !== 'string') errors.push('context reference id is required');
  if (!ref.workspaceId || typeof ref.workspaceId !== 'string') errors.push('context reference workspaceId is required');
  return { valid: errors.length === 0, errors };
}

/**
 * Canonical Notification creation (server-side model).
 */
export function createCanonicalNotification({
  notificationId,
  workspaceId,
  recipientUserId,
  eventType,
  title,
  message = '',
  contextReference,
  actionUrl = null,
  priority = NOTIFICATION_PRIORITIES.NORMAL,
  status = NOTIFICATION_STATUSES.UNREAD,
  metadata = {},
  createdBy,
}) {
  if (!notificationId || !workspaceId || !recipientUserId) {
    throw new Error('notificationId, workspaceId and recipientUserId are required');
  }
  if (!eventType || !title?.trim()) throw new Error('eventType and title are required');
  if (!createdBy?.actorId) throw new Error('createdBy is required');
  if (!Object.values(NOTIFICATION_STATUSES).includes(status)) throw new Error(`Invalid notification status: ${status}`);
  if (!Object.values(NOTIFICATION_PRIORITIES).includes(priority)) throw new Error(`Invalid notification priority: ${priority}`);
  const refCheck = validateContextReference(contextReference);
  if (!refCheck.valid) {
    throw new Error(`Invalid contextReference: ${refCheck.errors.join(', ')}`);
  }
  return Object.freeze({
    contractVersion: NOTIFICATION_CONTRACT_VERSION,
    notificationId,
    workspaceId,
    recipientUserId,
    eventType,
    // Legacy type field mirrors eventType for compatibility with existing UI.
    type: legacyNotificationTypeFor(eventType),
    title: title.trim(),
    message: String(message || '').trim(),
    contextReference: Object.freeze({ ...contextReference }),
    // Legacy flat reference fields (resourceType/resourceId/actionUrl) kept in sync.
    resourceType: contextReference.type,
    resourceId: contextReference.id,
    actionUrl,
    priority,
    status,
    metadata: Object.freeze({ ...metadata }),
    createdBy: Object.freeze({ ...createdBy }),
  });
}

function legacyNotificationTypeFor(eventType) {
  const map = {
    'record.created': 'RECORD_CREATED',
    'record.draft_saved': 'RECORD_DRAFT_SAVED',
    'record.submitted': 'RECORD_SUBMITTED',
  };
  return map[eventType] || 'RECORD_EVENT';
}
