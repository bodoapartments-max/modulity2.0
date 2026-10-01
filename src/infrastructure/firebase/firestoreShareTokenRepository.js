/**
 * Modulity 2.0 — Firestore Share Token Repository
 *
 * Path: workspaces/{workspaceId}/shareTokens/{tokenId}
 *
 * SECURITY: Only the SHA-256 hash of the token is stored. Never the plaintext.
 *
 * @module infrastructure/firebase/firestoreShareTokenRepository
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
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreShareTokenRepository(db) {
  function tokensCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'shareTokens');
  }

  function tokenDoc(workspaceId, tokenId) {
    return doc(db, 'workspaces', workspaceId, 'shareTokens', tokenId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      tokenId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(token) {
    const { createdAt, updatedAt, ...rest } = token;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, tokenId) {
    const snap = await getDoc(tokenDoc(workspaceId, tokenId));
    return mapFromFirestore(snap);
  }

  async function getByHash(workspaceId, tokenHash) {
    const q = query(tokensCol(workspaceId), where('tokenHash', '==', tokenHash));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
  }

  async function create(token) {
    const ref = tokenDoc(token.workspaceId, token.tokenId);
    await setDoc(ref, mapToFirestore(token));
    return token;
  }

  async function update(workspaceId, tokenId, changes) {
    const ref = tokenDoc(workspaceId, tokenId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function listByRecord(workspaceId, recordId) {
    const q = query(tokensCol(workspaceId), where('recordId', '==', recordId));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return { getById, getByHash, create, update, listByRecord };
}
