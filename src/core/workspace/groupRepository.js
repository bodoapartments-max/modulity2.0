/**
 * Modulity 2.0 — Group Repository Contract
 *
 * @typedef {import('./group.js').Group} Group
 */

/**
 * @typedef {Object} GroupRepository
 * @property {(group: Group) => Promise<Group>} create
 * @property {(groupId: string) => Promise<Group|null>} getById
 * @property {(organizationId: string) => Promise<Group[]>} getByOrganization
 * @property {(groupId: string, updates: Partial<Group>) => Promise<Group>} update
 * @property {(groupId: string) => Promise<void>} remove
 */

/**
 * @param {unknown} repo
 * @returns {asserts repo is GroupRepository}
 */
export function validateGroupRepository(repo) {
  const required = ['create', 'getById', 'getByOrganization', 'update', 'remove'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`GroupRepository must implement ${method}()`);
    }
  }
}
