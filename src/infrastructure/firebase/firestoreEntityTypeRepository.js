/**
 * Modulity 2.0 — Firestore EntityType Repository
 *
 * Path: workspaces/{workspaceId}/entityTypes/{typeId}
 *
 * @module infrastructure/firebase/firestoreEntityTypeRepository
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
 * @returns {import('../../core/data/entityTypeRepository.js').EntityTypeRepository}
 */
export function createFirestoreEntityTypeRepository(db) {
  function typesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'entityTypes');
  }

  function typeDoc(workspaceId, typeId) {
    return doc(db, 'workspaces', workspaceId, 'entityTypes', typeId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      typeId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(entityType) {
    const { createdAt, updatedAt, ...rest } = entityType;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, typeId) {
    const snap = await getDoc(typeDoc(workspaceId, typeId));
    return mapFromFirestore(snap);
  }

  async function getByCode(workspaceId, code) {
    const q = query(typesCol(workspaceId), where('code', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(typesCol(workspaceId));
    return snap.docs.map(mapFromFirestore);
  }

  async function listByCategory(workspaceId, category) {
    const q = query(typesCol(workspaceId), where('category', '==', category));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function create(entityType) {
    const ref = typeDoc(entityType.workspaceId, entityType.typeId);
    await setDoc(ref, mapToFirestore(entityType));
    return entityType;
  }

  async function update(workspaceId, typeId, changes) {
    const ref = typeDoc(workspaceId, typeId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function seed(workspaceId, entityType) {
    const ref = typeDoc(workspaceId, entityType.typeId);
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    await setDoc(ref, mapToFirestore({ ...entityType, workspaceId }));
  }

  return { getById, getByCode, listByWorkspace, listByCategory, create, update, seed };
}
