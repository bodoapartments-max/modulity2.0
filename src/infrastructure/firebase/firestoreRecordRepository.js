/**
 * Modulity 2.0 — Firestore Record Repository
 *
 * Path: workspaces/{workspaceId}/records/{recordId}
 *
 * Step 5.1 hardening:
 *   - paginatedQuery: explicit documentId() tie-breaker for stable pagination
 *   - Date filters: createdFrom / createdTo implemented server-side
 *   - Legacy methods bounded with explicit limits
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
  documentId,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreRecordRepository(db) {
  /** Internal hard cap for legacy unbounded methods. */
  const LEGACY_QUERY_LIMIT = 500;

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

  /**
   * Lists all records in a workspace.
   * BOUNDED: returns at most LEGACY_QUERY_LIMIT records.
   * For browse/list operations, prefer paginatedQuery().
   */
  async function listByWorkspace(workspaceId) {
    const q = query(recordsCol(workspaceId), firestoreLimit(LEGACY_QUERY_LIMIT));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByStatus(workspaceId, status) {
    const q = query(
      recordsCol(workspaceId),
      where('status', '==', status),
      firestoreLimit(LEGACY_QUERY_LIMIT),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByEntityRef(workspaceId, entityId) {
    const q = query(
      recordsCol(workspaceId),
      where('entityReferenceIds', 'array-contains', entityId),
      firestoreLimit(LEGACY_QUERY_LIMIT),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  /**
   * Legacy filter-based query.
   * BOUNDED: returns at most LEGACY_QUERY_LIMIT records.
   * For paginated browse, prefer paginatedQuery().
   */
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
    q = query(q, firestoreLimit(LEGACY_QUERY_LIMIT));
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
   * Paginated query with sorting, filtering, and date range.
   * Uses explicit documentId() tie-breaker for deterministic pagination
   * when multiple Records share identical sort-field values.
   *
   * @param {string} workspaceId
   * @param {import('../../core/data/recordQuery.js').RecordQueryParams} queryParams
   * @returns {Promise<import('../../core/data/recordQuery.js').PaginatedResult>}
   */
  async function paginatedQuery(workspaceId, queryParams) {
    const constraints = [];

    // Status filter (already normalized for ARCHIVED bucket by domain layer)
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

    // Date range filters — server-side using _createdAt Timestamp
    if (queryParams.createdFrom) {
      const fromDate = new Date(queryParams.createdFrom);
      constraints.push(where('_createdAt', '>=', Timestamp.fromDate(fromDate)));
    }
    if (queryParams.createdTo) {
      const toDate = new Date(queryParams.createdTo);
      constraints.push(where('_createdAt', '<=', Timestamp.fromDate(toDate)));
    }

    // Sort — map sortField to Firestore field names
    const firestoreSortField = queryParams.sortField === 'createdAt' ? '_createdAt'
      : queryParams.sortField === 'updatedAt' ? '_updatedAt'
      : queryParams.sortField || '_createdAt';
    const direction = queryParams.sortDirection || 'desc';
    constraints.push(orderBy(firestoreSortField, direction));

    // Explicit deterministic tie-breaker using documentId()
    // Ensures stable page boundaries when sort values are identical
    constraints.push(orderBy(documentId(), direction));

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
