/**
 * Modulity 2.0 — Firestore File Metadata Repository
 *
 * Read-side repository for canonical File + File Version documents.
 * Paths:
 *   workspaces/{workspaceId}/files/{fileId}
 *   workspaces/{workspaceId}/files/{fileId}/versions/{vN}
 *
 * Writes are trusted-command territory only — this adapter exposes reads.
 *
 * @module infrastructure/firebase/firestoreFileRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';

const MAX_LIST = 200;
const MAX_VERSIONS = 50;

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

  function versionsCol(workspaceId, fileId) {
    return collection(db, 'workspaces', workspaceId, 'files', fileId, 'versions');
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      fileId: d.fileId || docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  async function getById(workspaceId, fileId) {
    const snap = await getDoc(fileDoc(workspaceId, fileId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const q = query(filesCol(workspaceId), orderBy('_createdAt', 'desc'), limit(MAX_LIST));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function getVersion(workspaceId, fileId, version) {
    const versionId = typeof version === 'number' ? `v${version}` : String(version);
    const snap = await getDoc(doc(versionsCol(workspaceId, fileId), versionId));
    return mapFromFirestore(snap);
  }

  async function listVersions(workspaceId, fileId) {
    const q = query(versionsCol(workspaceId, fileId), orderBy('version', 'asc'), limit(MAX_VERSIONS));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return Object.freeze({ getById, listByWorkspace, getVersion, listVersions });
}
