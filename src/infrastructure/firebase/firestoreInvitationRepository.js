/**
 * Modulity 2.0 — Firestore Invitation Repository
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
import { createInvitation } from '../../core/workspace/invitation.js';

const COLLECTION = 'invitations';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/invitationRepository.js').InvitationRepository}
 */
export function createFirestoreInvitationRepository(db) {
  function toFirestore(invitation) {
    return {
      invitationId: invitation.invitationId,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      invitedByUserId: invitation.invitedByUserId,
      status: invitation.status,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
    };
  }

  function fromFirestore(data) {
    return createInvitation({
      invitationId: data.invitationId,
      organizationId: data.organizationId,
      email: data.email,
      role: data.role,
      invitedByUserId: data.invitedByUserId,
      status: data.status,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      acceptedAt: data.acceptedAt || null,
    });
  }

  async function create(invitation) {
    const ref = doc(db, COLLECTION, invitation.invitationId);
    await setDoc(ref, {
      ...toFirestore(invitation),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return invitation;
  }

  async function getById(invitationId) {
    const ref = doc(db, COLLECTION, invitationId);
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

  async function getByEmail(email) {
    const q = query(
      collection(db, COLLECTION),
      where('email', '==', email.trim().toLowerCase()),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function update(invitationId, updates) {
    const ref = doc(db, COLLECTION, invitationId);
    await updateDoc(ref, {
      ...updates,
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  return { create, getById, getByOrganization, getByEmail, update };
}
