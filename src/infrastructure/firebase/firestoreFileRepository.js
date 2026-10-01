/**
 * Modulity 2.0 — Firestore File Metadata Repository
 *
 * Path: workspaces/{workspaceId}/files/{fileId}
 *
 * @module infrastructure/firebase/firestoreFileRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreFileRepository(db) {
  function filesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'files');
  }

  function fileDoc(workspaceId, fileId) {
    return doc(db, 'workspaces', workspaceId, 'files', fileId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      fileId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
    };
  }

  function mapToFirestore(file) {
    const { createdAt, ...rest } = file;
    return { ...rest, _createdAt: serverTimestamp() };
  }

  async function getById(workspaceId, fileId) {
    const snap = await getDoc(fileDoc(workspaceId, fileId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(filesCol(workspaceId));
    return snap.docs.map(mapFromFirestore);
  }

  async function create(file) {
    const ref = fileDoc(file.workspaceId, file.fileId);
    await setDoc(ref, mapToFirestore(file));
    return file;
  }

  return { getById, listByWorkspace, create };
}
