/**
 * Modulity 2.0 — Firestore Entity Repository
 *
 * Path: workspaces/{workspaceId}/entities/{entityId}
 *
 * @module infrastructure/firebase/firestoreEntityRepository
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
  documentId,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/data/entityRepository.js').EntityRepository}
 */
export function createFirestoreEntityRepository(db) {
  function entitiesCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, 'entities');
  }

  function entityDoc(workspaceId, entityId) {
    return doc(db, 'workspaces', workspaceId, 'entities', entityId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      entityId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(entity) {
    const { createdAt, updatedAt, ...rest } = entity;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function getById(workspaceId, entityId) {
    const snap = await getDoc(entityDoc(workspaceId, entityId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId) {
    const snap = await getDocs(query(entitiesCol(workspaceId), limit(100)));
    return snap.docs.map(mapFromFirestore);
  }

  async function listByType(workspaceId, entityTypeId) {
    const q = query(entitiesCol(workspaceId), where('entityTypeId', '==', entityTypeId));
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function queryEntities(workspaceId, filters = {}) {
    let q = entitiesCol(workspaceId);
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.entityTypeId) {
      q = query(q, where('entityTypeId', '==', filters.entityTypeId));
    }
    const snap = await getDocs(q);
    return snap.docs.map(mapFromFirestore);
  }

  async function getManyByIds(workspaceId, entityIds) {
    const uniqueIds = [...new Set(entityIds)].slice(0, 100);
    const results = [];
    for (let index = 0; index < uniqueIds.length; index += 30) {
      const chunk = uniqueIds.slice(index, index + 30);
      const snap = await getDocs(query(entitiesCol(workspaceId), where(documentId(), 'in', chunk)));
      results.push(...snap.docs.map(mapFromFirestore));
    }
    return results;
  }

  async function create(entity) {
    const ref = entityDoc(entity.workspaceId, entity.entityId);
    await setDoc(ref, mapToFirestore(entity));
    return entity;
  }

  async function update(workspaceId, entityId, changes) {
    const ref = entityDoc(workspaceId, entityId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  return { getById, getManyByIds, listByWorkspace, listByType, query: queryEntities, create, update };
}
