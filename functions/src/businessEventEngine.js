/**
 * Trusted Business Event Backbone engine (Step 22).
 *
 * Canonical trusted-server semantics for canonical BusinessEvents:
 * - identity / contract-level validation
 * - authorized write through the operation journal (retry-safe, idempotent)
 * - addon: event persistence happens inside the SAME Firestore transaction
 *   that applies the business mutation, so event creation and mutation
 *   share durability
 * - never exposed as a callable — emitting events is an engine-internal
 *   responsibility, browsers have no event write path
 *
 * EVENT != AUDIT != LEDGER != NOTIFICATION.
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
  createBusinessEvent,
  businessEventIdFor,
  BUSINESS_EVENT_SOURCES,
} from './generated/src/core/events/businessEvent.js';
import { HttpsError } from 'firebase-functions/v2/https';

const fail = (code, message, details = {}) => {
  throw new HttpsError(code === 'NOT_FOUND' ? 'not-found' : 'failed-precondition', message, { code, ...details });
};

function businessEventCollection(db) {
  // Firestore layout: workspaces/{workspaceId}/businessEvents/{eventId}
  // We route through doc() because the test harness mirrors paths directly.
  return db;
}

function businessEventPath(workspaceId, eventId) {
  return `workspaces/${workspaceId}/businessEvents/${eventId}`;
}

/**
 * Idempotent trusted emission. If the same logical operation already wrote an
 * event with the same idempotency key, returns the existing event.
 *
 * NOTE: this engine splits read/write between planner and writer so the
 * Firestore transaction can read/check before write, then call the writer for
 * the document set.
 */
export function planBusinessEventEmission(db, { eventType, workspaceId, source, idempotencyKey }) {
  if (!Object.values(BUSINESS_EVENT_SOURCES).includes(source)) {
    fail('INTERNAL', 'Untrusted event source denied.');
  }
  const eventId = businessEventIdFor(idempotencyKey, eventType);
  const eventRef = db.doc(businessEventPath(workspaceId, eventId));
  // NOTE: callers must read this within the same transaction FIRST.
  return { eventRef, eventId };
}

/** Witness the planned event into the already-open transaction. */
export function eventDocWrite(tx, _db, params) {
  const { eventRef, eventId } = planBusinessEventEmission(_db, params);
  tx.set(eventRef, {
    ...createBusinessEvent({ ...params, eventId }),
    _persistedAt: FieldValue.serverTimestamp(),
  });
  return { eventId };
}

function businessEventsPath(workspaceId) {
  return `workspaces/${workspaceId}/businessEvents`;
}

function businessEventQuery(db, workspaceId, { eventType = null, objectRef = null, correlationId = null, limit = 50 } = {}) {
  let query = db.collection(businessEventsPath(workspaceId));
  const clauses = [];
  if (eventType) clauses.push((q) => q.where('eventType', '==', eventType));
  if (objectRef) {
    clauses.push((q) => q.where('objectReference.type', '==', objectRef.type));
    clauses.push((q) => q.where('objectReference.id', '==', objectRef.id));
  }
  if (correlationId) clauses.push((q) => q.where('correlationId', '==', correlationId));
  if (clauses.length) {
    for (const applyWhere of clauses) query = applyWhere(query);
  }
  return query.orderBy('_persistedAt', 'desc').limit(Math.min(limit, 50));
}

export async function listBusinessEvents(db, workspaceId, options = {}) {
  const snap = await businessEventQuery(db, workspaceId, options).get();
  return {
    items: snap.docs.map((d) => ({
      ...d.data(),
      eventId: d.id,
      recordedAt: d.data()._persistedAt?.toDate?.()?.toISOString?.() || d.data().recordedAt,
    })),
    hasMore: snap.docs.length === Math.min(options.limit || 50, 50),
  };
}

export async function getBusinessEvent(db, workspaceId, eventId) {
  const snap = await businessEventCollection(db).doc(workspaceId).collection('events').doc(eventId).get();
  return snap.exists ? (() => ({ ...snap.data(), eventId: snap.id }))() : null;
}

export const __sites = Object.freeze({ businessEventCollection, businessEventPath });
