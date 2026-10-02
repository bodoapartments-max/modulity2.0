/**
 * Modulity 2.0 — Firestore Audit Entry Repository
 *
 * Path: workspaces/{workspaceId}/auditEntries/{auditEntryId}
 *
 * Append-only: create only, no update, no delete.
 * Server-authoritative timestamps.
 *
 * @module infrastructure/firebase/firestoreAuditEntryRepository
 */

import {
  collection, doc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit as firestoreLimit,
  startAfter as firestoreStartAfter, documentId,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';

export function createFirestoreAuditEntryRepository(db) {
  function entriesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'auditEntries');
  }
  function entryDoc(workspaceId, entryId) {
    return doc(db, 'workspaces', workspaceId, 'auditEntries', entryId);
  }

  function mapFromFirestore(snap) {
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      ...d,
      auditEntryId: snap.id,
      timestamp: d._timestamp?.toDate?.()?.toISOString?.() || d.timestamp || null,
    };
  }

  async function create(entry) {
    const ref = entryDoc(entry.workspaceId, entry.auditEntryId);
    const { timestamp, ...rest } = entry;
    await setDoc(ref, { ...rest, _timestamp: serverTimestamp() });
    return entry;
  }

  async function getById(workspaceId, entryId) {
    const snap = await getDoc(entryDoc(workspaceId, entryId));
    return mapFromFirestore(snap);
  }

  /**
   * Paginated query for audit entries.
   * Supports filtering by resourceType, resourceId, actorId, action, date range.
   */
  async function paginatedQuery(workspaceId, params = {}) {
    const constraints = [];

    if (params.resourceType) {
      constraints.push(where('resourceType', '==', params.resourceType));
    }
    if (params.resourceId) {
      constraints.push(where('resourceId', '==', params.resourceId));
    }
    if (params.actorId) {
      constraints.push(where('actor.actorId', '==', params.actorId));
    }
    if (params.action) {
      constraints.push(where('action', '==', params.action));
    }
    if (params.dateFrom) {
      constraints.push(where('_timestamp', '>=', Timestamp.fromDate(new Date(params.dateFrom))));
    }
    if (params.dateTo) {
      constraints.push(where('_timestamp', '<=', Timestamp.fromDate(new Date(params.dateTo))));
    }

    const direction = params.sortDirection || 'desc';
    constraints.push(orderBy('_timestamp', direction));
    constraints.push(orderBy(documentId(), direction));

    if (params.startAfter) {
      constraints.push(firestoreStartAfter(params.startAfter));
    }

    const limit = Math.max(1, Math.min(100, params.limit || 25));
    const fetchLimit = limit + 1;
    constraints.push(firestoreLimit(fetchLimit));

    const q = query(entriesCol(workspaceId), ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map(mapFromFirestore);
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const lastDoc = hasMore ? snap.docs[limit - 1] : null;

    return { items, nextCursor: lastDoc || null, hasMore };
  }

  return { create, getById, paginatedQuery };
}
