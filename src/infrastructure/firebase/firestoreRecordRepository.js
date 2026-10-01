/**
 * Modulity 2.0 — Firestore Record Repository
 *
 * Path: workspaces/{workspaceId}/records/{recordId}
 *
 * @module infrastructure/firebase/firestoreRecordRepository
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
export function createFirestoreRecordRepository(db) {
  function recordsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'records');
  }

  function recordDoc(workspaceId, recordId) {
    return doc(db, 'workspaces', workspaceId, 'records', recordId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      recordId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(record) {
    const { createdAt, updatedAt, ...rest } = record;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, recordId) {
    const snap = await getDoc(recordDoc(workspaceId, recordId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(recordsCol(workspaceId));
    return snap.docs.map(mapFromFirestore);
  }

  async function listByStatus(workspaceId, status) {
    const q = query(recordsCol(workspaceId), where('status', '==', status));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function listByEntityRef(workspaceId, entityId) {
    const q = query(
      recordsCol(workspaceId),
      where('entityReferences', 'array-contains', entityId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function queryRecords(workspaceId, filters = {}) {
    let q = recordsCol(workspaceId);
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.recordType) {
      q = query(q, where('recordType', '==', filters.recordType));
    }
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function create(record) {
    const ref = recordDoc(record.workspaceId, record.recordId);
    await setDoc(ref, mapToFirestore(record));
    return record;
  }

  async function update(workspaceId, recordId, changes) {
    const ref = recordDoc(workspaceId, recordId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  return { getById, listByWorkspace, listByStatus, listByEntityRef, query: queryRecords, create, update };
}
