/**
 * Modulity 2.0 — Membership Repository Contract
 *
 * @typedef {import('./membership.js').Membership} Membership
 */

/**
 * @typedef {Object} MembershipRepository
 * @property {(membership: Membership) => Promise<Membership>} create
 * @property {(membershipId: string) => Promise<Membership|null>} getById
 * @property {(organizationId: string) => Promise<Membership[]>} getByOrganization
 * @property {(userId: string) => Promise<Membership[]>} getByUser
 * @property {(organizationId: string, userId: string) => Promise<Membership|null>} getByOrgAndUser
 * @property {(membershipId: string, updates: Partial<Membership>) => Promise<Membership>} update
 * @property {(organizationId: string) => Promise<number>} countOwners
 */

/**
 * @param {unknown} repo
 * @returns {asserts repo is MembershipRepository}
 */
export function validateMembershipRepository(repo) {
  const required = ['create', 'getById', 'getByOrganization', 'getByUser', 'getByOrgAndUser', 'update', 'countOwners'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`MembershipRepository must implement ${method}()`);
    }
  }
}
