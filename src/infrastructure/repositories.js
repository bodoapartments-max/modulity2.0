/**
 * Modulity 2.0 — Configured Repository Instances
 *
 * Exports the active repository implementations based on configuration.
 * Higher layers import from here instead of directly from Firebase adapters.
 */

import { firebaseDb } from './firebase/firebaseApp.js';
import { createFirestoreWorkspaceRepository } from './firebase/firestoreWorkspaceRepository.js';
import { createFirestoreOrganizationRepository } from './firebase/firestoreOrganizationRepository.js';
import { createFirestoreMembershipRepository } from './firebase/firestoreMembershipRepository.js';
import { createFirestoreGroupRepository } from './firebase/firestoreGroupRepository.js';
import { createFirestorePersonRepository } from './firebase/firestorePersonRepository.js';
import { createFirestoreInvitationRepository } from './firebase/firestoreInvitationRepository.js';

function createRepositories() {
  if (!firebaseDb) {
    console.error('[repositories] Firestore is not available. Data operations will fail.');
    return null;
  }

  return {
    workspaces: createFirestoreWorkspaceRepository(firebaseDb),
    organizations: createFirestoreOrganizationRepository(firebaseDb),
    memberships: createFirestoreMembershipRepository(firebaseDb),
    groups: createFirestoreGroupRepository(firebaseDb),
    persons: createFirestorePersonRepository(firebaseDb),
    invitations: createFirestoreInvitationRepository(firebaseDb),
  };
}

export const repositories = createRepositories();
export default repositories;
