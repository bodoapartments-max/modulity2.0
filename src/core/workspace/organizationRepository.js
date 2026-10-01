/**
 * Modulity 2.0 — Organization Repository Contract
 *
 * @typedef {import('./organization.js').Organization} Organization
 */

/**
 * @typedef {Object} OrganizationRepository
 * @property {(org: Organization) => Promise<Organization>} create
 * @property {(organizationId: string) => Promise<Organization|null>} getById
 * @property {(userId: string) => Promise<Organization[]>} getByCreator
 * @property {(organizationId: string, updates: Partial<Organization>) => Promise<Organization>} update
 */

/**
 * @param {unknown} repo
 * @returns {asserts repo is OrganizationRepository}
 */
export function validateOrganizationRepository(repo) {
  const required = ['create', 'getById', 'getByCreator', 'update'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`OrganizationRepository must implement ${method}()`);
    }
  }
}
