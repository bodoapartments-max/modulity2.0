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
import { createFirestoreEntityTypeRepository } from './firebase/firestoreEntityTypeRepository.js';
import { createFirestoreEntityRepository } from './firebase/firestoreEntityRepository.js';
import { createFirestoreRelationshipRepository } from './firebase/firestoreRelationshipRepository.js';
import { createFirestoreRecordRepository } from './firebase/firestoreRecordRepository.js';
import { createFirestoreFileRepository } from './firebase/firestoreFileRepository.js';
import { createFirestoreModuleRepository } from './firebase/firestoreModuleRepository.js';
import { createFirestoreDeliveryRepository } from './firebase/firestoreDeliveryRepository.js';
import { createFirestoreFormRequestRepository } from './firebase/firestoreFormRequestRepository.js';
import { createFirestoreFolderRepository } from './firebase/firestoreFolderRepository.js';
import { createFirestoreUserRecordStateRepository } from './firebase/firestoreUserRecordStateRepository.js';
import { createFirestoreShareTokenRepository } from './firebase/firestoreShareTokenRepository.js';
import { createFirestoreLedgerBookRepository } from './firebase/firestoreLedgerBookRepository.js';
import { createFirestoreLedgerEntryRepository } from './firebase/firestoreLedgerEntryRepository.js';
import { createFirestoreAuditEntryRepository } from './firebase/firestoreAuditEntryRepository.js';
import { createFirestoreLedgerCodeRepository } from './firebase/firestoreLedgerCodeRepository.js';

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
    entityTypes: createFirestoreEntityTypeRepository(firebaseDb),
    entities: createFirestoreEntityRepository(firebaseDb),
    relationships: createFirestoreRelationshipRepository(firebaseDb),
    records: createFirestoreRecordRepository(firebaseDb),
    files: createFirestoreFileRepository(firebaseDb),
    modules: createFirestoreModuleRepository(firebaseDb),
    deliveries: createFirestoreDeliveryRepository(firebaseDb),
    formRequests: createFirestoreFormRequestRepository(firebaseDb),
    folders: createFirestoreFolderRepository(firebaseDb),
    userRecordState: createFirestoreUserRecordStateRepository(firebaseDb),
    shareTokens: createFirestoreShareTokenRepository(firebaseDb),
    ledgerBooks: createFirestoreLedgerBookRepository(firebaseDb),
    ledgerEntries: createFirestoreLedgerEntryRepository(firebaseDb),
    auditEntries: createFirestoreAuditEntryRepository(firebaseDb),
    ledgerCodes: createFirestoreLedgerCodeRepository(firebaseDb),
  };
}

export const repositories = createRepositories();
export default repositories;
