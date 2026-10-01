/**
 * Modulity 2.0 — Firestore Folder Repository
 *
 * Folders: workspaces/{workspaceId}/folders/{folderId}
 * Items:   workspaces/{workspaceId}/folders/{folderId}/items/{itemId}
 *
 * @module infrastructure/firebase/firestoreFolderRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreFolderRepository(db) {
  function foldersCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'folders');
  }

  function folderDoc(workspaceId, folderId) {
    return doc(db, 'workspaces', workspaceId, 'folders', folderId);
  }

  function itemsCol(workspaceId, folderId) {
    return collection(db, 'workspaces', workspaceId, 'folders', folderId, 'items');
  }

  function itemDoc(workspaceId, folderId, itemId) {
    return doc(db, 'workspaces', workspaceId, 'folders', folderId, 'items', itemId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      folderId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(folder) {
    const { createdAt, updatedAt, ...rest } = folder;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, folderId) {
    const snap = await getDoc(folderDoc(workspaceId, folderId));
    return mapFromFirestore(snap);
  }

  async function create(folder) {
    const ref = folderDoc(folder.workspaceId, folder.folderId);
    await setDoc(ref, mapToFirestore(folder));
    return folder;
  }

  async function update(workspaceId, folderId, changes) {
    const ref = folderDoc(workspaceId, folderId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function remove(workspaceId, folderId) {
    // Delete all items first
    const itemsSnap = await getDocs(itemsCol(workspaceId, folderId));
    for (const itemSnap of itemsSnap.docs) {
      await deleteDoc(itemSnap.ref);
    }
    await deleteDoc(folderDoc(workspaceId, folderId));
  }

  /**
   * Lists folders accessible to a user (workspace-scoped + user's own).
   */
  async function listAccessible(workspaceId, userId) {
    // Get workspace-scoped folders
    const wsQuery = query(foldersCol(workspaceId), where('scope', '==', 'WORKSPACE'));
    const wsSnap = await getDocs(wsQuery);

    // Get user's personal folders
    const userQuery = query(
      foldersCol(workspaceId),
      where('scope', '==', 'USER'),
      where('ownerUserId', '==', userId),
    );
    const userSnap = await getDocs(userQuery);

    return [
      ...wsSnap.docs.map(mapFromFirestore),
      ...userSnap.docs.map(mapFromFirestore),
    ];
  }

  // ─── Folder Items ─────────────────────────────────

  async function addItem(workspaceId, folderId, item) {
    const ref = itemDoc(workspaceId, folderId, item.itemId);
    await setDoc(ref, { ...item, _addedAt: serverTimestamp() });
    return item;
  }

  async function removeItem(workspaceId, folderId, recordId) {
    const q = query(itemsCol(workspaceId, folderId), where('recordId', '==', recordId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  }

  async function listItems(workspaceId, folderId) {
    const snap = await getDocs(itemsCol(workspaceId, folderId));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        itemId: d.id,
        addedAt: data._addedAt?.toDate?.()?.toISOString?.() || data.addedAt || null,
      };
    });
  }

  return { getById, create, update, remove, listAccessible, addItem, removeItem, listItems };
}
