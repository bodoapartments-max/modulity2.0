/**
 * Modulity 2.0 — Firestore Membership Repository
 *
 * Memberships are stored as subcollections under organizations:
 *   organizations/{organizationId}/members/{userId}
 *
 * This deterministic path allows Firestore Security Rules to verify
 * membership via exists() and get() without queries.
 *
 * A top-level userMemberships/{userId}/orgs/{organizationId} index
 * enables efficient "get all memberships for a user" lookups.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { createMembership, SYSTEM_ROLES } from '../../core/workspace/membership.js';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/membershipRepository.js').MembershipRepository}
 */
export function createFirestoreMembershipRepository(db) {
  function memberDocRef(organizationId, userId) {
    return doc(db, 'organizations', organizationId, 'members', userId);
  }

  function userIndexRef(userId, organizationId) {
    return doc(db, 'userMemberships', userId, 'orgs', organizationId);
  }

  function toFirestore(membership) {
    return {
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
      membershipId: `${data.organizationId}_${data.userId}`,
      organizationId: data.organizationId,
      userId: data.userId,
      status: data.status,
      roles: data.roles || [SYSTEM_ROLES.MEMBER],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async function create(membership) {
    const batch = writeBatch(db);
    const memberRef = memberDocRef(membership.organizationId, membership.userId);
    const indexRef = userIndexRef(membership.userId, membership.organizationId);
    const data = toFirestore(membership);

    batch.set(memberRef, {
      ...data,
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });

    batch.set(indexRef, {
      organizationId: membership.organizationId,
      userId: membership.userId,
      status: membership.status,
      roles: membership.roles,
      _updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return membership;
  }

  async function getById(membershipId) {
    const parts = membershipId.split('_');
    if (parts.length < 2) return null;
    const organizationId = parts[0];
    const userId = parts.slice(1).join('_');
    return getByOrgAndUser(organizationId, userId);
  }

  async function getByOrganization(organizationId) {
    const membersCol = collection(db, 'organizations', organizationId, 'members');
    const snap = await getDocs(membersCol);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function getByUser(userId) {
    const orgsCol = collection(db, 'userMemberships', userId, 'orgs');
    const snap = await getDocs(orgsCol);
    if (snap.empty) return [];

    const memberships = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const memberRef = memberDocRef(data.organizationId, userId);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) return null;
        return fromFirestore(memberSnap.data());
      }),
    );

    return memberships.filter(Boolean);
  }

  async function getByOrgAndUser(organizationId, userId) {
    const ref = memberDocRef(organizationId, userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function update(membershipId, updates) {
    const parts = membershipId.split('_');
    if (parts.length < 2) throw new Error('Invalid membershipId format');
    const organizationId = parts[0];
    const userId = parts.slice(1).join('_');

    const batch = writeBatch(db);
    const memberRef = memberDocRef(organizationId, userId);
    const indexRef = userIndexRef(userId, organizationId);

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    };

    batch.update(memberRef, updateData);

    const indexUpdate = { _updatedAt: serverTimestamp() };
    if (updates.status) indexUpdate.status = updates.status;
    if (updates.roles) indexUpdate.roles = updates.roles;
    batch.update(indexRef, indexUpdate);

    await batch.commit();

    const snap = await getDoc(memberRef);
    return fromFirestore(snap.data());
  }

  async function countOwners(organizationId) {
    const membersCol = collection(db, 'organizations', organizationId, 'members');
    const q = query(membersCol, where('roles', 'array-contains', SYSTEM_ROLES.OWNER));
    const snap = await getDocs(q);
    return snap.size;
  }

  return { create, getById, getByOrganization, getByUser, getByOrgAndUser, update, countOwners };
}
