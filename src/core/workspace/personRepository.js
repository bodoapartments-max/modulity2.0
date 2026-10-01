/**
 * Modulity 2.0 — Person/Profile Repository Contract
 *
 * @typedef {import('./person.js').Person} Person
 */

/**
 * @typedef {Object} PersonRepository
 * @property {(person: Person) => Promise<Person>} create
 * @property {(userId: string) => Promise<Person|null>} getByUserId
 * @property {(userId: string, updates: Partial<Person>) => Promise<Person>} update
 */

/**
 * @param {unknown} repo
 * @returns {asserts repo is PersonRepository}
 */
export function validatePersonRepository(repo) {
  const required = ['create', 'getByUserId', 'update'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`PersonRepository must implement ${method}()`);
    }
  }
}
