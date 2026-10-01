/**
 * Modulity 2.0 — Firestore Form Request Repository
 *
 * Path: workspaces/{workspaceId}/formRequests/{requestId}
 *
 * Includes completeRequestAtomic() which uses a Firestore transaction
 * to atomically create the result Record and mark the request COMPLETED.
 *
 * @module infrastructure/firebase/firestoreFormRequestRepository
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
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreFormRequestRepository(db) {
  function requestsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'formRequests');
  }

  function requestDoc(workspaceId, requestId) {
    return doc(db, 'workspaces', workspaceId, 'formRequests', requestId);
  }

  function recordDoc(workspaceId, recordId) {
    return doc(db, 'workspaces', workspaceId, 'records', recordId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      requestId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(request) {
    const { createdAt, updatedAt, ...rest } = request;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, requestId) {
    const snap = await getDoc(requestDoc(workspaceId, requestId));
    return mapFromFirestore(snap);
  }

  async function create(request) {
    const ref = requestDoc(request.workspaceId, request.requestId);
    await setDoc(ref, mapToFirestore(request));
    return request;
  }

  async function update(workspaceId, requestId, changes) {
    const ref = requestDoc(workspaceId, requestId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  /**
   * Atomically completes a Form Request by creating the result Record
   * and updating the request status in a single Firestore transaction.
   *
   * IDEMPOTENCY: Uses the deterministic recordId (derived from requestId).
   * If the Record already exists inside the transaction, the completion
   * is treated as a retry and the existing state is returned.
   *
   * CONCURRENCY: The transaction reads the request document first. If
   * another transaction has already moved it to COMPLETED, this one
   * aborts cleanly without creating a duplicate Record.
   *
   * @param {string} workspaceId
   * @param {string} requestId
   * @param {Object} recordData — the full Record value object to persist
   * @param {Object} requestUpdates — { status, resultRecordId, updatedAt }
   * @returns {Promise<{ request: Object, record: Object }>}
   */
  async function completeRequestAtomic(workspaceId, requestId, recordData, requestUpdates) {
    const reqRef = requestDoc(workspaceId, requestId);
    const recRef = recordDoc(workspaceId, recordData.recordId);

    const result = await runTransaction(db, async (transaction) => {
      // Read request inside transaction for concurrency guard
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('Form request not found inside transaction');
      }
      const reqData = reqSnap.data();

      // Concurrency guard: if already COMPLETED, this is a retry
      if (reqData.status === 'COMPLETED') {
        const existingRecSnap = await transaction.get(recRef);
        return {
          alreadyCompleted: true,
          request: { ...reqData, requestId },
          record: existingRecSnap.exists()
            ? { ...existingRecSnap.data(), recordId: existingRecSnap.id }
            : { recordId: recordData.recordId },
        };
      }

      // Guard: only non-terminal statuses can complete
      const terminal = ['COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'];
      if (terminal.includes(reqData.status)) {
        throw new Error(`Cannot complete request in ${reqData.status} state`);
      }

      // Idempotency check: if Record already exists (partial retry), skip creation
      const existingRecSnap = await transaction.get(recRef);
      if (!existingRecSnap.exists()) {
        // Create the Record
        const { createdAt, updatedAt, ...recRest } = recordData;
        transaction.set(recRef, {
          ...recRest,
          _createdAt: serverTimestamp(),
          _updatedAt: serverTimestamp(),
        });
      }

      // Update the request to COMPLETED
      transaction.update(reqRef, {
        ...requestUpdates,
        _updatedAt: serverTimestamp(),
      });

      return {
        alreadyCompleted: false,
        request: { ...reqData, ...requestUpdates, requestId },
        record: recordData,
      };
    });

    return result;
  }

  async function listByRequester(workspaceId, userId) {
    const q = query(
      requestsCol(workspaceId),
      where('requester.actorId', '==', userId),
      orderBy('_createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByRecipient(workspaceId, userId) {
    const q = query(
      requestsCol(workspaceId),
      where('recipientUserId', '==', userId),
      orderBy('_createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return { getById, create, update, completeRequestAtomic, listByRequester, listByRecipient };
}
