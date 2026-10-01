/**
 * Modulity 2.0 — Firestore Record Repository
 *
 * Path: workspaces/{workspaceId}/records/{recordId}
 *
 * @module infrastructure/firebase/firestoreRecordRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter as firestoreStartAfter,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreRecordRepository(db) {
  function recordsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'records');
  }

  function recordDoc(workspaceId, recordId) {
    return doc(db, 'workspaces', workspaceId, 'records', recordId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      recordId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(record) {
    const { createdAt, updatedAt, ...rest } = record;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, recordId) {
    const snap = await getDoc(recordDoc(workspaceId, recordId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(recordsCol(workspaceId));
    return snap.docs.map(mapFromFirestore);
  }

  async function listByStatus(workspaceId, status) {
    const q = query(recordsCol(workspaceId), where('status', '==', status));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByEntityRef(workspaceId, entityId) {
    const q = query(
      recordsCol(workspaceId),
      where('entityReferenceIds', 'array-contains', entityId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function queryRecords(workspaceId, filters = {}) {
    let q = recordsCol(workspaceId);
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.recordType) {
      q = query(q, where('recordType', '==', filters.recordType));
    }
    if (filters.moduleId) {
      q = query(q, where('moduleId', '==', filters.moduleId));
    }
    if (filters.priority) {
      q = query(q, where('priority', '==', filters.priority));
    }
    if (filters.createdByUserId) {
      q = query(q, where('createdBy.actorId', '==', filters.createdByUserId));
    }
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function create(record) {
    const ref = recordDoc(record.workspaceId, record.recordId);
    await setDoc(ref, mapToFirestore(record));
    return record;
  }

  async function update(workspaceId, recordId, changes) {
    const ref = recordDoc(workspaceId, recordId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * Paginated query with sorting and filtering.
   * Supports cursor-based pagination using Firestore startAfter.
   *
   * @param {string} workspaceId
   * @param {import('../../core/data/recordQuery.js').RecordQueryParams} queryParams
   * @returns {Promise<import('../../core/data/recordQuery.js').PaginatedResult>}
   */
  async function paginatedQuery(workspaceId, queryParams) {
    const constraints = [];

    // Status filter
    if (queryParams.status) {
      constraints.push(where('status', '==', queryParams.status));
    }

    // Module scope filter
    if (queryParams.moduleId) {
      constraints.push(where('moduleId', '==', queryParams.moduleId));
    }

    // Record type filter
    if (queryParams.recordType) {
      constraints.push(where('recordType', '==', queryParams.recordType));
    }

    // Priority filter
    if (queryParams.priority) {
      constraints.push(where('priority', '==', queryParams.priority));
    }

    // OWN bucket — filter by creator
    if (queryParams.bucket === 'OWN' && queryParams.userId) {
      constraints.push(where('createdBy.actorId', '==', queryParams.userId));
    }

    // ARCHIVED bucket — filter by status
    if (queryParams.bucket === 'ARCHIVED') {
      constraints.push(where('status', '==', 'ARCHIVED'));
    }

    // Sort — map sortField to Firestore field names
    const firestoreSortField = queryParams.sortField === 'createdAt' ? '_createdAt'
      : queryParams.sortField === 'updatedAt' ? '_updatedAt'
      : queryParams.sortField || '_createdAt';
    constraints.push(orderBy(firestoreSortField, queryParams.sortDirection || 'desc'));

    // Deterministic tie-breaker using document ID
    // (Firestore naturally orders by doc ID within same sort value)

    // Pagination cursor
    if (queryParams.startAfter) {
      constraints.push(firestoreStartAfter(queryParams.startAfter));
    }

    // Limit — fetch one extra to detect hasMore
    const fetchLimit = queryParams.limit + 1;
    constraints.push(firestoreLimit(fetchLimit));

    const q = query(recordsCol(workspaceId), ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map(mapFromFirestore);

    const hasMore = docs.length > queryParams.limit;
    const items = hasMore ? docs.slice(0, queryParams.limit) : docs;
    const lastDoc = hasMore ? snap.docs[queryParams.limit - 1] : null;

    return {
      items,
      nextCursor: lastDoc || null,
      hasMore,
    };
  }

  return { getById, listByWorkspace, listByStatus, listByEntityRef, query: queryRecords, create, update, paginatedQuery };
}
