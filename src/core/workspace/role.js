/**
 * Modulity 2.0 — Role & Authorization Foundation
 *
 * Central role/capability evaluation boundary.
 * This will later evolve into the full Permission Engine.
 *
 * System roles: OWNER, ADMIN, MEMBER
 *
 * Do NOT confuse with job positions (Manager, Receptionist, etc.)
 * which belong to future business data.
 */

import { SYSTEM_ROLES } from './membership.js';

/**
 * Capability definitions for each system role.
 * Each role inherits capabilities of roles below it.
 */
const ROLE_CAPABILITIES = Object.freeze({
  [SYSTEM_ROLES.MEMBER]: Object.freeze([
    'workspace.view',
    'organization.view',
    'members.view',
    'groups.view',
    'profile.edit',
  ]),
  [SYSTEM_ROLES.ADMIN]: Object.freeze([
    'workspace.view',
    'organization.view',
    'organization.edit',
    'members.view',
    'members.invite',
    'members.edit',
    'members.suspend',
    'groups.view',
    'groups.create',
    'groups.edit',
    'groups.delete',
    'profile.edit',
  ]),
  [SYSTEM_ROLES.OWNER]: Object.freeze([
    'workspace.view',
    'organization.view',
    'organization.edit',
    'organization.delete',
    'members.view',
    'members.invite',
    'members.edit',
    'members.suspend',
    'members.remove',
    'members.change_role',
    'groups.view',
    'groups.create',
    'groups.edit',
    'groups.delete',
    'profile.edit',
    'ownership.transfer',
  ]),
});

/**
 * Returns the effective capabilities for a set of roles.
 * Merges capabilities from all roles (highest role wins).
 *
 * @param {string[]} roles
 * @returns {string[]}
 */
export function getCapabilities(roles) {
  const capabilities = new Set();
  for (const role of roles) {
    const roleCaps = ROLE_CAPABILITIES[role];
    if (roleCaps) {
      for (const cap of roleCaps) {
        capabilities.add(cap);
      }
    }
  }
  return [...capabilities];
}

/**
 * Checks whether a set of roles grants a specific capability.
 *
 * @param {string[]} roles
 * @param {string} capability
 * @returns {boolean}
 */
export function hasCapability(roles, capability) {
  return getCapabilities(roles).includes(capability);
}

/**
 * Returns the highest role from a set of roles.
 * Order: OWNER > ADMIN > MEMBER
 *
 * @param {string[]} roles
 * @returns {string}
 */
export function getHighestRole(roles) {
  if (roles.includes(SYSTEM_ROLES.OWNER)) return SYSTEM_ROLES.OWNER;
  if (roles.includes(SYSTEM_ROLES.ADMIN)) return SYSTEM_ROLES.ADMIN;
  return SYSTEM_ROLES.MEMBER;
}

export { ROLE_CAPABILITIES };
