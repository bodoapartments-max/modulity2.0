/**
 * Modulity 2.0 — Firestore Workspace Repository
 *
 * Firestore-backed implementation of the WorkspaceRepository contract.
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
import { createWorkspace, WORKSPACE_TYPES } from '../../core/workspace/workspace.js';

const COLLECTION = 'workspaces';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/workspaceRepository.js').WorkspaceRepository}
 */
export function createFirestoreWorkspaceRepository(db) {
  function toFirestore(workspace) {
    return {
      workspaceId: workspace.workspaceId,
      type: workspace.type,
      name: workspace.name,
      ownerUserId: workspace.ownerUserId,
      organizationId: workspace.organizationId,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  function fromFirestore(data) {
    return createWorkspace({
      workspaceId: data.workspaceId,
      type: data.type,
      name: data.name,
      ownerUserId: data.ownerUserId,
      organizationId: data.organizationId || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(workspace) {
    const ref = doc(db, COLLECTION, workspace.workspaceId);
    await setDoc(ref, {
      ...toFirestore(workspace),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return workspace;
  }

  async function getById(workspaceId) {
    const ref = doc(db, COLLECTION, workspaceId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function getPersonalWorkspace(userId) {
    const q = query(
      collection(db, COLLECTION),
      where('ownerUserId', '==', userId),
      where('type', '==', WORKSPACE_TYPES.PERSONAL),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return fromFirestore(snap.docs[0].data());
  }

  async function getWorkspacesForUser(userId) {
    const q = query(
      collection(db, COLLECTION),
      where('ownerUserId', '==', userId),
      where('type', '==', WORKSPACE_TYPES.PERSONAL),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function getByOrganizationId(organizationId) {
    const q = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('type', '==', WORKSPACE_TYPES.ORGANIZATION),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return fromFirestore(snap.docs[0].data());
  }

  async function update(workspaceId, updates) {
    const ref = doc(db, COLLECTION, workspaceId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  return { create, getById, getPersonalWorkspace, getWorkspacesForUser, getByOrganizationId, update };
}
