/**
 * Modulity 2.0 — Firestore Relationship Repository
 *
 * Path: workspaces/{workspaceId}/relationships/{relationshipId}
 *
 * @module infrastructure/firebase/firestoreRelationshipRepository
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
  limit,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreRelationshipRepository(db) {
  function relsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'relationships');
  }

  function relDoc(workspaceId, relationshipId) {
    return doc(db, 'workspaces', workspaceId, 'relationships', relationshipId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      relationshipId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
    };
  }

  function mapToFirestore(rel) {
    const { createdAt, ...rest } = rel;
    return { ...rest, _createdAt: serverTimestamp() };
  }

  async function getById(workspaceId, relationshipId) {
    const snap = await getDoc(relDoc(workspaceId, relationshipId));
    return mapFromFirestore(snap);
  }

  async function listForObject(workspaceId, objectType, objectId) {
    const sourceQ = query(
      relsCol(workspaceId),
      where('source.objectType', '==', objectType),
      where('source.objectId', '==', objectId),
    );
    const targetQ = query(
      relsCol(workspaceId),
      where('target.objectType', '==', objectType),
      where('target.objectId', '==', objectId),
    );
    const [sourceSnap, targetSnap] = await Promise.all([
      getDocs(sourceQ),
      getDocs(targetQ),
    ]);
    const results = new Map();
    for (const d of sourceSnap.docs) results.set(d.id, mapFromFirestore(d));
    for (const d of targetSnap.docs) results.set(d.id, mapFromFirestore(d));
    return Array.from(results.values());
  }

  async function listByWorkspace(workspaceId, maxResults = 100) {
    const snap = await getDocs(query(relsCol(workspaceId), limit(Math.min(maxResults, 100))));
    return snap.docs.map(mapFromFirestore);
  }

  async function create(rel) {
    const ref = relDoc(rel.workspaceId, rel.relationshipId);
    await setDoc(ref, mapToFirestore(rel));
    return rel;
  }

  async function update(workspaceId, relationshipId, changes) {
    const ref = relDoc(workspaceId, relationshipId);
    await updateDoc(ref, changes);
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  return { getById, listForObject, listByWorkspace, create, update };
}
