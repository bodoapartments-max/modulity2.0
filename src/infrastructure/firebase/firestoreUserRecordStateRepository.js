/**
 * Modulity 2.0 — Firestore User Record State Repository
 *
 * Path: workspaces/{workspaceId}/userRecordState/{compositeId}
 * compositeId = userId_recordId (deterministic)
 *
 * @module infrastructure/firebase/firestoreUserRecordStateRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreUserRecordStateRepository(db) {
  function stateCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'userRecordState');
  }

  function stateDoc(workspaceId, stateId) {
    return doc(db, 'workspaces', workspaceId, 'userRecordState', stateId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      stateId: docSnap.id,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  async function getById(workspaceId, stateId) {
    const snap = await getDoc(stateDoc(workspaceId, stateId));
    return mapFromFirestore(snap);
  }

  /**
   * Creates or updates user record state (upsert).
   * Uses setDoc with merge to handle both create and update.
   */
  async function upsert(workspaceId, state) {
    const ref = stateDoc(workspaceId, state.stateId);
    await setDoc(ref, {
      ...state,
      _updatedAt: serverTimestamp(),
    }, { merge: true });
    return state;
  }

  /**
   * Gets all starred record IDs for a user in a workspace.
   */
  async function getStarredRecordIds(workspaceId, userId) {
    const q = query(
      stateCol(workspaceId),
      where('userId', '==', userId),
      where('starred', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data().recordId);
  }

  return { getById, upsert, getStarredRecordIds };
}
