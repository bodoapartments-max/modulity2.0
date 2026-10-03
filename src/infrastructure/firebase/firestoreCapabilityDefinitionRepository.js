/**
 * Modulity 2.0 — Firestore Capability Definition Repository
 *
 * Path: workspaces/{workspaceId}/capabilityDefinitions/{definitionId}
 *
 * Generic storage for CapabilityDefinitions across all Capability Engines.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

export function createFirestoreCapabilityDefinitionRepository(db) {
  const COLLECTION = 'capabilityDefinitions';

  function definitionsCol(workspaceId) {
    return collection(db, 'workspaces', workspaceId, COLLECTION);
  }

  function definitionDoc(workspaceId, definitionId) {
    return doc(db, 'workspaces', workspaceId, COLLECTION, definitionId);
  }

  function mapFromFirestore(docSnap) {
    if (!docSnap.exists()) return null;
    const d = docSnap.data();
    return {
      ...d,
      definitionId: docSnap.id,
      createdAt: d._createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
      updatedAt: d._updatedAt?.toDate?.()?.toISOString?.() || d.updatedAt || null,
    };
  }

  function mapToFirestore(definition) {
    const { createdAt, updatedAt, ...rest } = definition;
    return { ...rest, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() };
  }

  async function create(definition) {
    const ref = definitionDoc(definition.workspaceId, definition.definitionId);
    await setDoc(ref, mapToFirestore(definition));
    return definition;
  }

  async function getById(workspaceId, definitionId) {
    const snap = await getDoc(definitionDoc(workspaceId, definitionId));
    return mapFromFirestore(snap);
  }

  async function listByWorkspace(workspaceId, options = {}) {
    const constraints = [orderBy('_createdAt', 'desc')];
    if (options.status) constraints.unshift(where('status', '==', options.status));
    if (options.engineId) constraints.unshift(where('engineId', '==', options.engineId));
    if (options.limit) constraints.push(limit(Math.min(options.limit, 500)));
    const snap = await getDocs(query(definitionsCol(workspaceId), ...constraints));
    return snap.docs.map(mapFromFirestore);
  }

  async function listByEngine(workspaceId, engineId, options = {}) {
    return listByWorkspace(workspaceId, { ...options, engineId });
  }

  async function update(workspaceId, definitionId, changes) {
    const ref = definitionDoc(workspaceId, definitionId);
    await updateDoc(ref, { ...changes, _updatedAt: serverTimestamp() });
    const snap = await getDoc(ref);
    return mapFromFirestore(snap);
  }

  async function deleteDefinition(workspaceId, definitionId) {
    const ref = definitionDoc(workspaceId, definitionId);
    await deleteDoc(ref);
  }

  return { create, getById, listByWorkspace, listByEngine, update, deleteDefinition };
}
