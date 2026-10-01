/**
 * Modulity 2.0 — Workspace Repository Contract
 *
 * Defines the interface that any workspace persistence adapter must implement.
 * Infrastructure layer provides the implementation (e.g. Firestore).
 *
 * @typedef {import('./workspace.js').Workspace} Workspace
 */

/**
 * @typedef {Object} WorkspaceRepository
 * @property {(workspace: Workspace) => Promise<Workspace>} create
 * @property {(workspaceId: string) => Promise<Workspace|null>} getById
 * @property {(userId: string) => Promise<Workspace|null>} getPersonalWorkspace
 * @property {(userId: string) => Promise<Workspace[]>} getWorkspacesForUser
 * @property {(organizationId: string) => Promise<Workspace|null>} getByOrganizationId
 * @property {(workspaceId: string, updates: Partial<Workspace>) => Promise<Workspace>} update
 */

/**
 * Validates that an object implements the WorkspaceRepository contract.
 *
 * @param {unknown} repo
 * @returns {asserts repo is WorkspaceRepository}
 */
export function validateWorkspaceRepository(repo) {
  const required = ['create', 'getById', 'getPersonalWorkspace', 'getWorkspacesForUser', 'getByOrganizationId', 'update'];
  for (const method of required) {
    if (typeof repo[method] !== 'function') {
      throw new Error(`WorkspaceRepository must implement ${method}()`);
    }
  }
}
