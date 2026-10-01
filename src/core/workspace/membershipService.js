/**
 * Modulity 2.0 — Membership Application Service
 *
 * Manages membership lifecycle, role changes, and owner safety invariants.
 * React-independent.
 */

import { MEMBERSHIP_STATUSES, SYSTEM_ROLES } from './membership.js';
import { hasCapability } from './role.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./membershipRepository.js').MembershipRepository} deps.membershipRepo
 * @param {import('./personRepository.js').PersonRepository} deps.personRepo
 * @returns {Object}
 */
export function createMembershipService({ membershipRepo, personRepo }) {
  /**
   * Gets all members of an organization with their profile info.
   *
   * @param {string} organizationId
   * @returns {Promise<Array<{ membership, person }>>}
   */
  async function getOrganizationMembers(organizationId) {
    const memberships = await membershipRepo.getByOrganization(organizationId);

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const person = await personRepo.getByUserId(membership.userId);
        return { membership, person };
      }),
    );

    return members;
  }

  /**
   * Changes a member's role.
   * Enforces: organization must not end up with zero owners.
   *
   * @param {string} membershipId
   * @param {string[]} newRoles
   * @param {string} actorUserId — the user performing the change
   * @param {string[]} actorRoles — roles of the acting user
   * @returns {Promise<Membership>}
   */
  async function changeRole(membershipId, newRoles, actorUserId, actorRoles) {
    if (!hasCapability(actorRoles, 'members.change_role')) {
      throw new AppError('forbidden', 'You do not have permission to change roles.');
    }

    const membership = await membershipRepo.getById(membershipId);
    if (!membership) {
      throw new AppError('not_found', 'Membership not found.');
    }

    const isRemovingOwner = membership.roles.includes(SYSTEM_ROLES.OWNER)
      && !newRoles.includes(SYSTEM_ROLES.OWNER);

    if (isRemovingOwner) {
      const ownerCount = await membershipRepo.countOwners(membership.organizationId);
      if (ownerCount <= 1) {
        throw new AppError(
          'owner_safety',
          'Cannot remove the last owner. Transfer ownership first.',
        );
      }
    }

    const updated = await membershipRepo.update(membershipId, { roles: newRoles });

    eventBus.emit(createEvent({
      eventType: 'membership.role_changed',
      organizationId: membership.organizationId,
      actor: { type: 'user', id: actorUserId },
      payload: {
        membershipId,
        userId: membership.userId,
        oldRoles: membership.roles,
        newRoles,
      },
    }));

    return updated;
  }

  /**
   * Changes a member's status.
   *
   * @param {string} membershipId
   * @param {string} newStatus
   * @param {string} actorUserId
   * @param {string[]} actorRoles
   * @returns {Promise<Membership>}
   */
  async function changeStatus(membershipId, newStatus, actorUserId, actorRoles) {
    const membership = await membershipRepo.getById(membershipId);
    if (!membership) {
      throw new AppError('not_found', 'Membership not found.');
    }

    if (newStatus === MEMBERSHIP_STATUSES.SUSPENDED && !hasCapability(actorRoles, 'members.suspend')) {
      throw new AppError('forbidden', 'You do not have permission to suspend members.');
    }

    if (newStatus === MEMBERSHIP_STATUSES.LEFT && membership.roles.includes(SYSTEM_ROLES.OWNER)) {
      const ownerCount = await membershipRepo.countOwners(membership.organizationId);
      if (ownerCount <= 1) {
        throw new AppError(
          'owner_safety',
          'The last owner cannot leave the organization. Transfer ownership first.',
        );
      }
    }

    const updated = await membershipRepo.update(membershipId, { status: newStatus });

    eventBus.emit(createEvent({
      eventType: 'membership.status_changed',
      organizationId: membership.organizationId,
      actor: { type: 'user', id: actorUserId },
      payload: {
        membershipId,
        userId: membership.userId,
        oldStatus: membership.status,
        newStatus,
      },
    }));

    return updated;
  }

  /**
   * Gets the current user's membership for an organization.
   */
  async function getUserMembership(organizationId, userId) {
    return membershipRepo.getByOrgAndUser(organizationId, userId);
  }

  /**
   * Gets all memberships for a user.
   */
  async function getUserMemberships(userId) {
    return membershipRepo.getByUser(userId);
  }

  return {
    getOrganizationMembers,
    changeRole,
    changeStatus,
    getUserMembership,
    getUserMemberships,
  };
}
