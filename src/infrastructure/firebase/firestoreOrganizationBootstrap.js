/**
 * Modulity 2.0 — Organization Bootstrap (Atomic Batch)
 *
 * Creates Organization + Organization Workspace + OWNER Membership
 * as a single atomic Firestore batch write.
 *
 * This replaces the non-atomic Promise.all pattern and ensures
 * that the organization, workspace, and initial OWNER membership
 * are either all created or none are created.
 *
 * This is the ONLY path for organization creation. The security rules
 * allow the initial OWNER membership write only when the organization
 * document is being created in the same batch (createdByUserId == auth.uid).
 */

import {
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Atomically creates an organization with its workspace and OWNER membership.
 *
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} params
 * @param {Object} params.organization — domain Organization object
 * @param {Object} params.workspace    — domain Workspace object
 * @param {Object} params.membership   — domain Membership object
 * @returns {Promise<void>}
 */
export async function createOrganizationAtomic(db, { organization, workspace, membership }) {
  const batch = writeBatch(db);

  const orgRef = doc(db, 'organizations', organization.organizationId);
  batch.set(orgRef, {
    organizationId: organization.organizationId,
    name: organization.name,
    type: organization.type,
    country: organization.country,
    description: organization.description,
    createdByUserId: organization.createdByUserId,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  });

  const workspaceRef = doc(db, 'workspaces', workspace.workspaceId);
  batch.set(workspaceRef, {
    workspaceId: workspace.workspaceId,
    type: workspace.type,
    name: workspace.name,
    ownerUserId: workspace.ownerUserId,
    organizationId: workspace.organizationId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  });

  const memberRef = doc(db, 'organizations', organization.organizationId, 'members', membership.userId);
  batch.set(memberRef, {
    organizationId: membership.organizationId,
    userId: membership.userId,
    status: membership.status,
    roles: membership.roles,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  });

  const userIndexRef = doc(db, 'userMemberships', membership.userId, 'orgs', organization.organizationId);
  batch.set(userIndexRef, {
    organizationId: organization.organizationId,
    userId: membership.userId,
    status: membership.status,
    roles: membership.roles,
    _updatedAt: serverTimestamp(),
  });

  await batch.commit();
}
