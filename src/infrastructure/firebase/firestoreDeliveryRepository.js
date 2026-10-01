/**
 * Modulity 2.0 — Firestore Delivery Repository
 *
 * Path: workspaces/{workspaceId}/deliveries/{deliveryId}
 *
 * @module infrastructure/firebase/firestoreDeliveryRepository
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
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 */
export function createFirestoreDeliveryRepository(db) {
  function deliveriesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'deliveries');
  }

  function deliveryDoc(workspaceId, deliveryId) {
    return doc(db, 'workspaces', workspaceId, 'deliveries', deliveryId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      deliveryId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(delivery) {
    const { createdAt, updatedAt, ...rest } = delivery;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, deliveryId) {
    const snap = await getDoc(deliveryDoc(workspaceId, deliveryId));
    return mapFromFirestore(snap);
  }

  async function create(delivery) {
    const ref = deliveryDoc(delivery.workspaceId, delivery.deliveryId);
    await setDoc(ref, mapToFirestore(delivery));
    return delivery;
  }

  async function update(workspaceId, deliveryId, changes) {
    const ref = deliveryDoc(workspaceId, deliveryId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function listBySender(workspaceId, userId) {
    const q = query(
      deliveriesCol(workspaceId),
      where('sender.actorId', '==', userId),
      orderBy('_createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByRecipient(workspaceId, userId) {
    const q = query(
      deliveriesCol(workspaceId),
      where('recipientUserId', '==', userId),
      orderBy('_createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByRecord(workspaceId, recordId) {
    const q = query(
      deliveriesCol(workspaceId),
      where('recordId', '==', recordId),
      orderBy('_createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  return { getById, create, update, listBySender, listByRecipient, listByRecord };
}
