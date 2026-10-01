/**
 * Modulity 2.0 — Firestore Organization Repository
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
import { createOrganization } from '../../core/workspace/organization.js';

const COLLECTION = 'organizations';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/organizationRepository.js').OrganizationRepository}
 */
export function createFirestoreOrganizationRepository(db) {
  function toFirestore(org) {
    return {
      organizationId: org.organizationId,
      name: org.name,
      type: org.type,
      country: org.country,
      description: org.description,
      createdByUserId: org.createdByUserId,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  function fromFirestore(data) {
    return createOrganization({
      organizationId: data.organizationId,
      name: data.name,
      type: data.type,
      country: data.country,
      description: data.description || '',
      createdByUserId: data.createdByUserId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(org) {
    const ref = doc(db, COLLECTION, org.organizationId);
    await setDoc(ref, {
      ...toFirestore(org),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return org;
  }

  async function getById(organizationId) {
    const ref = doc(db, COLLECTION, organizationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function getByCreator(userId) {
    const q = query(
      collection(db, COLLECTION),
      where('createdByUserId', '==', userId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function update(organizationId, updates) {
    const ref = doc(db, COLLECTION, organizationId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  return { create, getById, getByCreator, update };
}
