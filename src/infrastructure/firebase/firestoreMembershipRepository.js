/**
 * Modulity 2.0 — Firestore Membership Repository
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
import { createMembership, SYSTEM_ROLES } from '../../core/workspace/membership.js';

const COLLECTION = 'memberships';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/membershipRepository.js').MembershipRepository}
 */
export function createFirestoreMembershipRepository(db) {
  function toFirestore(membership) {
    return {
      membershipId: membership.membershipId,
      organizationId: membership.organizationId,
      userId: membership.userId,
      status: membership.status,
      roles: membership.roles,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }

  function fromFirestore(data) {
    return createMembership({
      membershipId: data.membershipId,
      organizationId: data.organizationId,
      userId: data.userId,
      status: data.status,
      roles: data.roles || [SYSTEM_ROLES.MEMBER],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(membership) {
    const ref = doc(db, COLLECTION, membership.membershipId);
    await setDoc(ref, {
      ...toFirestore(membership),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return membership;
  }

  async function getById(membershipId) {
    const ref = doc(db, COLLECTION, membershipId);
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

  async function getByUser(userId) {
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function getByOrgAndUser(organizationId, userId) {
    const q = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('userId', '==', userId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return fromFirestore(snap.docs[0].data());
  }

  async function update(membershipId, updates) {
    const ref = doc(db, COLLECTION, membershipId);
    await updateDoc(ref, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  async function countOwners(organizationId) {
    const q = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('roles', 'array-contains', SYSTEM_ROLES.OWNER),
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  return { create, getById, getByOrganization, getByUser, getByOrgAndUser, update, countOwners };
}
