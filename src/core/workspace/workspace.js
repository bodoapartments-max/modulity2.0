/**
 * Modulity 2.0 — Workspace Domain Model
 *
 * A Workspace is the common operating context for all platform features.
 * Every module, record, entity, report and widget operates within a Workspace.
 *
 * Types:
 *   PERSONAL      — one per user, auto-created
 *   ORGANIZATION  — one per organization, created with the organization
 */

export const WORKSPACE_TYPES = Object.freeze({
  PERSONAL: 'PERSONAL',
  ORGANIZATION: 'ORGANIZATION',
});

/**
 * @typedef {Object} Workspace
 * @property {string} workspaceId
 * @property {'PERSONAL'|'ORGANIZATION'} type
 * @property {string} name
 * @property {string} ownerUserId       — userId for PERSONAL, organizationId for ORGANIZATION
 * @property {string|null} organizationId — null for PERSONAL workspaces
 * @property {string} createdAt         — ISO 8601 timestamp
 * @property {string} updatedAt         — ISO 8601 timestamp
 */

/**
 * Creates a Workspace value object.
 *
 * @param {Object} params
 * @returns {Workspace}
 */
export function createWorkspace({ workspaceId, type, name, ownerUserId, organizationId = null, createdAt, updatedAt }) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!WORKSPACE_TYPES[type]) throw new Error(`Invalid workspace type: ${type}`);
  if (!name || name.trim() === '') throw new Error('Workspace name is required');
  if (!ownerUserId) throw new Error('ownerUserId is required');

  return Object.freeze({
    workspaceId,
    type,
    name: name.trim(),
    ownerUserId,
    organizationId,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}
