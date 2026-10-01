/**
 * Modulity 2.0 — Firestore Form Request Repository
 *
 * Path: workspaces/{workspaceId}/formRequests/{requestId}
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

  return { getById, create, update, listByRequester, listByRecipient };
}
