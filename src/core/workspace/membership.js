/**
 * Modulity 2.0 — Membership Domain Model
 *
 * Membership represents the relationship between a User and an Organization.
 *
 * User != Person != Employee != Membership != Role
 * Membership is NOT an Employee record.
 */

export const MEMBERSHIP_STATUSES = Object.freeze({
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  LEFT: 'LEFT',
});

export const SYSTEM_ROLES = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
});

/**
 * @typedef {Object} Membership
 * @property {string} membershipId
 * @property {string} organizationId
 * @property {string} userId
 * @property {string} status          — one of MEMBERSHIP_STATUSES
 * @property {string[]} roles         — subset of SYSTEM_ROLES
 * @property {string} createdAt       — ISO 8601
 * @property {string} updatedAt       — ISO 8601
 */

/**
 * Creates a Membership value object.
 *
 * @param {Object} params
 * @returns {Membership}
 */
export function createMembership({
  membershipId,
  organizationId,
  userId,
  status = MEMBERSHIP_STATUSES.ACTIVE,
  roles = [SYSTEM_ROLES.MEMBER],
  createdAt,
  updatedAt,
}) {
  if (!membershipId) throw new Error('membershipId is required');
  if (!organizationId) throw new Error('organizationId is required');
  if (!userId) throw new Error('userId is required');
  if (!MEMBERSHIP_STATUSES[status]) throw new Error(`Invalid membership status: ${status}`);
  if (!Array.isArray(roles) || roles.length === 0) throw new Error('At least one role is required');
  for (const role of roles) {
    if (!SYSTEM_ROLES[role]) throw new Error(`Invalid role: ${role}`);
  }

  return Object.freeze({
    membershipId,
    organizationId,
    userId,
    status,
    roles: Object.freeze([...roles]),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Checks whether a membership has a specific role.
 *
 * @param {Membership} membership
 * @param {string} role
 * @returns {boolean}
 */
export function hasRole(membership, role) {
  return membership.roles.includes(role);
}

/**
 * Checks whether a membership is active.
 *
 * @param {Membership} membership
 * @returns {boolean}
 */
export function isActiveMember(membership) {
  return membership.status === MEMBERSHIP_STATUSES.ACTIVE;
}
