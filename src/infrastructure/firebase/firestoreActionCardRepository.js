/**
 * Modulity 2.0 — Firestore Action Card Repository (Step 31)
 *
 * Read-side repository for the ActionCard projection.
 * Path: workspaces/{workspaceId}/actionCards/{actionCardId}
 *
 * Cards are written exclusively by trusted command engines — this adapter
 * is read-only.
 *
 * @module infrastructure/firebase/firestoreActionCardRepository
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

const MAX_CARDS = 100;

export function createFirestoreActionCardRepository(db) {
  function cardsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'actionCards');
  }

  function mapCard(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      actionCardId: d.actionCardId || docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
    };
  }

  async function getById(workspaceId, actionCardId) {
    return mapCard(await getDoc(doc(cardsCol(workspaceId), actionCardId)));
  }

  async function listOpenByAudience(workspaceId, userId) {
    const q = query(
      cardsCol(workspaceId),
      where('audienceUserIds', 'array-contains', userId),
      where('status', '==', 'OPEN'),
      orderBy('_createdAt', 'desc'),
      limit(MAX_CARDS),
    );
    return (await getDocs(q)).docs.map(mapCard);
  }

  return Object.freeze({ getById, listOpenByAudience });
}
