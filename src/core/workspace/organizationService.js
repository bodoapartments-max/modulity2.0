/**
 * Modulity 2.0 — Organization Application Service
 *
 * Handles organization creation as one logical operation:
 *   1. Create Organization
 *   2. Create Organization Workspace
 *   3. Create OWNER Membership for creator
 *   4. Emit events
 *
 * React-independent.
 */

import { createOrganization } from './organization.js';
import { createWorkspace, WORKSPACE_TYPES } from './workspace.js';
import { createMembership, MEMBERSHIP_STATUSES, SYSTEM_ROLES } from './membership.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';

/**
 * @param {Object} deps
 * @param {import('./organizationRepository.js').OrganizationRepository} deps.organizationRepo
 * @param {import('./workspaceRepository.js').WorkspaceRepository} deps.workspaceRepo
 * @param {import('./membershipRepository.js').MembershipRepository} deps.membershipRepo
 * @returns {Object}
 */
export function createOrganizationService({ organizationRepo, workspaceRepo, membershipRepo }) {
  /**
   * Creates an organization with its workspace and owner membership.
   * This is one logical operation.
   *
   * @param {Object} params
   * @param {string} params.name
   * @param {string} params.type        — one of ORGANIZATION_TYPES
   * @param {string} params.country
   * @param {string} params.description
   * @param {string} params.userId      — the creating user
   * @returns {Promise<{ organization, workspace, membership }>}
   */
  async function createOrganizationWithWorkspace({ name, type, country, description = '', userId }) {
    const organizationId = generateId();
    const workspaceId = generateId();
    const membershipId = generateId();

    const organization = createOrganization({
      organizationId,
      name,
      type,
      country,
      description,
      createdByUserId: userId,
    });

    const workspace = createWorkspace({
      workspaceId,
      type: WORKSPACE_TYPES.ORGANIZATION,
      name,
      ownerUserId: organizationId,
      organizationId,
    });

    const membership = createMembership({
      membershipId,
      organizationId,
      userId,
      status: MEMBERSHIP_STATUSES.ACTIVE,
      roles: [SYSTEM_ROLES.OWNER],
    });

    const [createdOrg, createdWorkspace, createdMembership] = await Promise.all([
      organizationRepo.create(organization),
      workspaceRepo.create(workspace),
      membershipRepo.create(membership),
    ]);

    const correlationId = `corr:${generateId()}`;
    const actor = { type: 'user', id: userId };

    eventBus.emit(createEvent({
      eventType: 'organization.created',
      organizationId,
      workspaceId,
      actor,
      payload: { organizationId, name, type },
      correlationId,
    }));

    eventBus.emit(createEvent({
      eventType: 'workspace.created',
      organizationId,
      workspaceId,
      actor,
      payload: { workspaceId, type: WORKSPACE_TYPES.ORGANIZATION },
      correlationId,
    }));

    eventBus.emit(createEvent({
      eventType: 'membership.created',
      organizationId,
      workspaceId,
      actor,
      payload: { membershipId, userId, role: SYSTEM_ROLES.OWNER },
      correlationId,
    }));

    return {
      organization: createdOrg,
      workspace: createdWorkspace,
      membership: createdMembership,
    };
  }

  /**
   * Updates an organization's basic information.
   *
   * @param {string} organizationId
   * @param {Object} updates — { name, description, country }
   * @param {string} userId  — acting user (for audit)
   * @returns {Promise<Organization>}
   */
  async function updateOrganization(organizationId, updates, userId) {
    const updated = await organizationRepo.update(organizationId, updates);

    eventBus.emit(createEvent({
      eventType: 'organization.updated',
      organizationId,
      actor: { type: 'user', id: userId },
      payload: { organizationId, changedFields: Object.keys(updates) },
    }));

    return updated;
  }

  /**
   * Gets an organization by ID.
   */
  async function getOrganization(organizationId) {
    return organizationRepo.getById(organizationId);
  }

  return {
    createOrganizationWithWorkspace,
    updateOrganization,
    getOrganization,
  };
}
