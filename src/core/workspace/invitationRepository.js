/**
 * Modulity 2.0 — Invitation Repository Contract
 *
 * @typedef {import('./invitation.js').Invitation} Invitation
 */

/**
 * @typedef {Object} InvitationRepository
 * @property {(invitation: Invitation) => Promise<Invitation>} create
 * @property {(invitationId: string) => Promise<Invitation|null>} getById
 * @property {(organizationId: string) => Promise<Invitation[]>} getByOrganization
 * @property {(email: string) => Promise<Invitation[]>} getByEmail
 * @property {(invitationId: string, updates: Partial<Invitation>) => Promise<Invitation>} update
 */

/**
 * @param {unknown} repo
 * @returns {asserts repo is InvitationRepository}
 */
export function validateInvitationRepository(repo) {
  const required = ['create', 'getById', 'getByOrganization', 'getByEmail', 'update'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`InvitationRepository must implement ${method}()`);
    }
  }
}
