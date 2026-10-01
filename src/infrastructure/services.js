/**
 * Modulity 2.0 — Configured Service Instances
 *
 * Wires repositories to application services.
 * Higher layers import from here.
 */

import { repositories } from './repositories.js';
import { firebaseDb } from './firebase/firebaseApp.js';
import { createWorkspaceService } from '../core/workspace/workspaceService.js';
import { createOrganizationService } from '../core/workspace/organizationService.js';
import { createMembershipService } from '../core/workspace/membershipService.js';
import { createGroupService } from '../core/workspace/groupService.js';
import { createOrganizationAtomic } from './firebase/firestoreOrganizationBootstrap.js';

function createServices() {
  if (!repositories) {
    console.error('[services] Repositories are not available.');
    return null;
  }

  return {
    workspace: createWorkspaceService({
      workspaceRepo: repositories.workspaces,
      personRepo: repositories.persons,
    }),
    organization: createOrganizationService({
      organizationRepo: repositories.organizations,
      workspaceRepo: repositories.workspaces,
      membershipRepo: repositories.memberships,
      atomicBootstrap: firebaseDb
        ? (params) => createOrganizationAtomic(firebaseDb, params)
        : null,
    }),
    membership: createMembershipService({
      membershipRepo: repositories.memberships,
      personRepo: repositories.persons,
    }),
    group: createGroupService({
      groupRepo: repositories.groups,
    }),
  };
}

export const services = createServices();
export default services;
