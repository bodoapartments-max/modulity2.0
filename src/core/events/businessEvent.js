/**
 * Modulity 2.0 — Canonical BusinessEvent (Step 22)
 *
 * **BUSINESS EVENTS DESCRIBE BUSINESS FACTS THAT HAPPENED.**
 *
 * They are NOT commands. They are NOT permissions. They are NOT
 * policies. They are NOT notifications. They are NOT audit entries.
 * They are NOT Ledger entries.
 *
 * EVENT != AUDIT != LEDGER != NOTIFICATION != COMMAND.
 *
 * Canonical BusinessEvents are durable, append-only, trusted-server-authored.
 * Consumers react through other trusted surfaces later. Step 22 exists so
 * future Engines (Rules, Integration, Billing, Compliance, etc.) never
 * invent their own event format again.
 *
 * @module core/events/businessEvent
 */
export const BUSINESS_EVENT_CONTRACT_VERSION = '1.0.0';

/**
 * Canonical event type registry — deterministic UPPER_SNAKE machine code.
 * Register one entry per type with an explicit contractVersion so future
 * Shape-evolutions stay mergeable.
 */
export const BUSINESS_EVENT_TYPES = Object.freeze({
  // record lifecycle (existing canonical behavior now emits its own events)
  RECORD_CREATED: 'record.created',
  RECORD_UPDATED: 'record.updated',
  RECORD_ARCHIVED: 'record.archived',
  RECORD_RESTORED: 'record.restored',
  RECORD_CANCELLED: 'record.cancelled',
  // Step 30 — file lifecycle
  FILE_CREATED: 'file.created',
  FILE_VERSION_CREATED: 'file.version_created',
  FILE_ATTACHED: 'file.attached',
  FILE_DETACHED: 'file.detached',
  FILE_ARCHIVED: 'file.archived',
  FILE_RESTORED: 'file.restored',
  // Step 31 — approval lifecycle
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_STEP_COMPLETED: 'approval.step_completed',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',
  APPROVAL_CANCELLED: 'approval.cancelled',
  APPROVAL_EXPIRED: 'approval.expired',
  // todo: future events registered in later steps (never invented ahead)
});

/**
 * Source registry — what produced this event. Future integrations add
 * TRUSTED_EXTERNAL_SOURCE kinds via the Gateway; Step 22 starts with the
 * trusted-command surface only.
 */
export const BUSINESS_EVENT_SOURCES = Object.freeze({
  RECORD_COMMAND: 'recordCommand',
  LEDGER_COMMAND: 'ledgerCommand',
  ADMIN_COMMAND: 'adminCommand',
  AUTOMAT_PLAN: 'automatPlan',
  AUTOMAT_APPLY: 'automatApplyPlan',
  FILE_COMMAND: 'fileCommand',
  APPROVAL_COMMAND: 'approvalCommand',
  TRUSTED_INTERNAL: 'trusted_internal',
});

export const BUSINESS_EVENT_ACTOR_TYPES = Object.freeze({
  USER: 'USER',
  SERVER: 'SERVER',
  AGENT: 'AGENT',   // Future only — mode-scoped (never direct canonical write)
  INTEGRATION: 'INTEGRATION', // future integrations
});

export const MAX_BUSINESS_EVENT_TYPES = 64;
export const MAX_BUSINESS_EVENT_PAYLOAD_BYTES = 64_000;
export const EVENT_ID_PREFIX = 'be_';

/**
 * Immutable substantive content of a BusinessEvent.
 */
export function createBusinessEvent({
  eventId,
  eventType,
  workspaceId,
  source,
  actor = null,
  objectReference = null,
  payload = {},
  idempotencyKey,
  correlationId = null,
  causeEventId = null,
  occurredAt = null,
  recordedAt = null,
  contractVersion = BUSINESS_EVENT_CONTRACT_VERSION,
}) {
  if (!eventId) throw new Error('eventId is required');
  if (!Object.values(BUSINESS_EVENT_TYPES).includes(eventType) || typeof eventType !== 'string') {
    throw new Error(`Unknown BusinessEvent type: ${eventType}`);
  }
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!Object.values(BUSINESS_EVENT_SOURCES).includes(source)) throw new Error(`Invalid BusinessEvent source: ${source}`);
  if (actor && !BUSINESS_EVENT_ACTOR_TYPES[actor.actorType || actor.type]) {
    throw new Error(`Invalid BusinessEvent actor type: ${actor?.actorType || actor?.type}`);
  }
  if (objectReference) {
    if (typeof objectReference !== 'object' || Array.isArray(objectReference)) throw new Error('objectReference must be a plain object');
    if (!objectReference.type || !objectReference.id || !objectReference.workspaceId) throw new Error('objectReference requires type, id and workspaceId');
    if (objectReference.workspaceId !== workspaceId) throw new Error('objectReference must be in the same Workspace');
  }
  if (typeof payload !== 'object' || payload === null) throw new Error('payload must be a plain object');
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > MAX_BUSINESS_EVENT_PAYLOAD_BYTES) throw new Error('payload exceeds size limit');
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (causeEventId && typeof causeEventId !== 'string') throw new Error('causeEventId must be a previous BusinessEvent id or null');
  return Object.freeze({
    eventId,
    contractVersion,
    eventType,
    workspaceId,
    source,
    actor: actor ? Object.freeze({ ...actor }) : null,
    objectReference: objectReference ? Object.freeze({ ...objectReference }) : null,
    payload: Object.freeze({ ...payload }),
    idempotencyKey,
    correlationId,
    causeEventId,
    occurredAt: occurredAt || new Date().toISOString(),
    recordedAt: recordedAt || new Date().toISOString(),
  });
}

/** Deterministic event id for a logical trusted operation. */
export function businessEventIdFor(operationId, eventType) {
  return `${EVENT_ID_PREFIX}${operationId}_${eventType}`;
}

/**
 * Strips secrets/unsafe data from user input before it reaches the event store.
 * Purpose-built — NOT a generic sanitizer. Keep bounded.
 */
export function sanitizeBusinessEventInput(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const cloned = JSON.parse(JSON.stringify(raw));
  delete cloned.password;
  delete cloned.token;
  delete cloned.accessToken;
  delete cloned.refreshToken;
  delete cloned.apiKey;
  delete cloned.secret;
  cloned.payload = cloned.payload === undefined ? {} : cloned.payload;
  return cloned;
}

/** True only for events produced by trusted server commands. */
export function isTrustedBusinessEventSource(source) {
  return Object.values(BUSINESS_EVENT_SOURCES).includes(source);
}
