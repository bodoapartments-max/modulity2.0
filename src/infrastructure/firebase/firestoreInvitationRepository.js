/**
 * Modulity 2.0 — Firestore Invitation Repository
 *
 * Invitations are stored as subcollections under organizations:
 *   organizations/{organizationId}/invitations/{invitationId}
 *
 * This ensures organization-level security rule isolation.
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

/**
 * @param {import('firebase/firestore').Firestore} db
 * @returns {import('../../core/workspace/invitationRepository.js').InvitationRepository}
 */
export function createFirestoreInvitationRepository(db) {
  function invitationDocRef(organizationId, invitationId) {
    return doc(db, 'organizations', organizationId, 'invitations', invitationId);
  }

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
    const ref = invitationDocRef(invitation.organizationId, invitation.invitationId);
    await setDoc(ref, {
      ...toFirestore(invitation),
      _createdAt: serverTimestamp(),
      _updatedAt: serverTimestamp(),
    });
    return invitation;
  }

  async function getById(invitationId, organizationId) {
    if (!organizationId) return null;
    const ref = invitationDocRef(organizationId, invitationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return fromFirestore(snap.data());
  }

  async function getByOrganization(organizationId) {
    const invCol = collection(db, 'organizations', organizationId, 'invitations');
    const snap = await getDocs(invCol);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function getByEmail(email, organizationId) {
    if (!organizationId) return [];
    const invCol = collection(db, 'organizations', organizationId, 'invitations');
    const q = query(invCol, where('email', '==', email.trim().toLowerCase()));
    const snap = await getDocs(q);
    return snap.docs.map((d) => fromFirestore(d.data()));
  }

  async function update(invitationId, updates, organizationId) {
    if (!organizationId) throw new Error('organizationId required for invitation update');
    const ref = invitationDocRef(organizationId, invitationId);
    await updateDoc(ref, {
      ...updates,
      _updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    return fromFirestore(snap.data());
  }

  return { create, getById, getByOrganization, getByEmail, update };
}
