/**
 * Modulity 2.0 — Module Repository Contract
 *
 * Provider-independent interface for Module persistence.
 * Firestore adapter in infrastructure/firebase/.
 *
 * @module modules/moduleRepository
 */

/**
 * @typedef {Object} ModuleRepository
 * @property {function} create — persist a new Module
 * @property {function} getById — get Module by moduleId
 * @property {function} getByCode — get Module by moduleCode within workspace
 * @property {function} listByWorkspace — list all Modules in a workspace
 * @property {function} update — update Module fields
 * @property {function} archive — soft-archive a Module
 */

/**
 * Documents the expected ModuleRepository interface.
 * Implementations must provide all methods.
 */
export const MODULE_REPOSITORY_CONTRACT = Object.freeze({
  methods: ['create', 'getById', 'getByCode', 'listByWorkspace', 'update', 'archive'],
});
