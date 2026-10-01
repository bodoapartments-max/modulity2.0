/**
 * Modulity 2.0 — Firestore Group Repository
 *
 * Groups are stored as subcollections under organizations:
 *   organizations/{organizationId}/groups/{groupId}
 *
 * This enables Firestore Security Rules to enforce organization-level
 * access control using the parent organization path.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { createGroup } from '../../core/workspace/group.js';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/groupRepository.js').GroupRepository}
 */
export function createFirestoreGroupRepository(db) {
  function groupDocRef(organizationId, groupId) {
    return doc(db, 'organizations', organizationId, 'groups', groupId);
  }

  function toFirestore(group) {
    return {
      groupId: group.groupId,
      organizationId: group.organizationId,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  function fromFirestore(data) {
    return createGroup({
      groupId: data.groupId,
      organizationId: data.organizationId,
      name: data.name,
      description: data.description || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(group) {
    const ref = groupDocRef(group.organizationId, group.groupId);
    await setDoc(ref, {
      ...toFirestore(group),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return group;
  }

  async function getById(groupId, organizationId) {
    if (!organizationId) return null;
    const ref = groupDocRef(organizationId, groupId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function getByOrganization(organizationId) {
    const groupsCol = collection(db, 'organizations', organizationId, 'groups');
    const snap = await getDocs(groupsCol);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function update(groupId, updates, organizationId) {
    if (!organizationId && updates.organizationId) {
      organizationId = updates.organizationId;
    }
    if (!organizationId) throw new Error('organizationId required for group update');
    const ref = groupDocRef(organizationId, groupId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  async function remove(groupId, organizationId) {
    if (!organizationId) throw new Error('organizationId required for group deletion');
    const ref = groupDocRef(organizationId, groupId);
    await deleteDoc(ref);
  }

  return { create, getById, getByOrganization, update, remove };
}
