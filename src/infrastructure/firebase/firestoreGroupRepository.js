/**
 * Modulity 2.0 — Firestore Group Repository
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
import { createGroup } from '../../core/workspace/group.js';

const COLLECTION = 'groups';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/groupRepository.js').GroupRepository}
 */
export function createFirestoreGroupRepository(db) {
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
    const ref = doc(db, COLLECTION, group.groupId);
    await setDoc(ref, {
      ...toFirestore(group),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return group;
  }

  async function getById(groupId) {
    const ref = doc(db, COLLECTION, groupId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function getByOrganization(organizationId) {
    const q = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function update(groupId, updates) {
    const ref = doc(db, COLLECTION, groupId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  async function remove(groupId) {
    const ref = doc(db, COLLECTION, groupId);
    await deleteDoc(ref);
  }

  return { create, getById, getByOrganization, update, remove };
}
