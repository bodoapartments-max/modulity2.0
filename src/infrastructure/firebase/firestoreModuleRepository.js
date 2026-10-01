/**
 * Modulity 2.0 — Firestore Module Repository
 *
 * Path: workspaces/{workspaceId}/modules/{moduleId}
 *
 * @module infrastructure/firebase/firestoreModuleRepository
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
 * @returns {import('../../modules/moduleRepository.js').ModuleRepository}
 */
export function createFirestoreModuleRepository(db) {
  function modulesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'modules');
  }

  function moduleDoc(workspaceId, moduleId) {
    return doc(db, 'workspaces', workspaceId, 'modules', moduleId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      moduleId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(mod) {
    const { createdAt, updatedAt, ...rest } = mod;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, moduleId) {
    const snap = await getDoc(moduleDoc(workspaceId, moduleId));
    return mapFromFirestore(snap);
  }

  async function getByCode(workspaceId, moduleCode) {
    const q = query(modulesCol(workspaceId), where('moduleCode', '==', moduleCode));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return mapFromFirestore(snap.docs[0]);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(modulesCol(workspaceId));
    return snap.docs.map(mapFromFirestore);
  }

  async function create(mod) {
    const ref = moduleDoc(mod.workspaceId, mod.moduleId);
    await setDoc(ref, mapToFirestore(mod));
    return mod;
  }

  async function update(workspaceId, moduleId, changes) {
    const ref = moduleDoc(workspaceId, moduleId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function archive(workspaceId, moduleId) {
    return update(workspaceId, moduleId, { status: 'ARCHIVED' });
  }

  return { getById, getByCode, listByWorkspace, create, update, archive };
}
