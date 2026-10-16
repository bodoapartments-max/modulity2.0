/**
 * Modulity 2.0 — Firestore File Attachment Repository (Step 30)
 *
 * Read-side repository for canonical FileAttachment documents.
 * Path: workspaces/{workspaceId}/fileAttachments/{attachmentId}
 *
 * Writes belong to the trusted fileCommand boundary — this adapter is
 * read-only.
 *
 * @module infrastructure/firebase/firestoreFileAttachmentRepository
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

const MAX_ATTACHMENTS = 100;

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreFileAttachmentRepository(db) {
  function attachmentsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'fileAttachments');
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      attachmentId: d.attachmentId || docSnap.id,
      attachedAt: d._createdAt?.toDate?.()?.toISOString?.() || d.attachedAt || null,
    };
  }

  async function getById(workspaceId, attachmentId) {
    const snap = await getDoc(doc(attachmentsCol(workspaceId), attachmentId));
    return mapFromFirestore(snap);
  }

  async function listActiveByTarget(workspaceId, targetType, targetId) {
    const q = query(
      attachmentsCol(workspaceId),
      where('targetType', '==', targetType),
      where('targetId', '==', targetId),
      where('status', '==', 'ACTIVE'),
      orderBy('_createdAt', 'asc'),
      limit(MAX_ATTACHMENTS),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByFile(workspaceId, fileId) {
    const q = query(
      attachmentsCol(workspaceId),
      where('fileId', '==', fileId),
      orderBy('_createdAt', 'desc'),
      limit(MAX_ATTACHMENTS),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return Object.freeze({ getById, listActiveByTarget, listByFile });
}
