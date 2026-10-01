/**
 * Modulity 2.0 — Folder
 *
 * Folders organize Records without copying them.
 * Folder membership references canonical Record IDs.
 *
 * Path: workspaces/{workspaceId}/folders/{folderId}
 * Items: workspaces/{workspaceId}/folders/{folderId}/items/{itemId}
 *
 * @module core/data/folder
 */

export const FOLDER_SCOPES = Object.freeze({
  WORKSPACE: 'WORKSPACE',
  USER: 'USER',
});

/**
 * @typedef {Object} Folder
 * @property {string} folderId
 * @property {string} workspaceId
 * @property {string} name
 * @property {string} scope — WORKSPACE or USER
 * @property {string|null} ownerUserId — required when scope is USER
 * @property {string|null} color — optional folder color
 * @property {Object} createdBy — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates a Folder value object.
 *
 * @param {Object} params
 * @returns {Folder}
 */
export function createFolder({
  folderId,
  workspaceId,
  name,
  scope = FOLDER_SCOPES.USER,
  ownerUserId = null,
  color = null,
  createdBy,
  createdAt,
  updatedAt,
}) {
  if (!folderId) throw new Error('folderId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Folder name is required');
  }
  if (!FOLDER_SCOPES[scope]) {
    throw new Error(`Invalid folder scope: ${scope}`);
  }
  if (scope === FOLDER_SCOPES.USER && !ownerUserId) {
    throw new Error('ownerUserId is required for USER-scoped folders');
  }
  if (!createdBy) throw new Error('createdBy is required');

  return Object.freeze({
    folderId,
    workspaceId,
    name: name.trim(),
    scope,
    ownerUserId,
    color,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * @typedef {Object} FolderItem
 * @property {string} itemId
 * @property {string} folderId
 * @property {string} recordId — reference to canonical Record
 * @property {string} addedBy — userId who added this item
 * @property {string} addedAt
 */

/**
 * Creates a FolderItem value object.
 *
 * @param {Object} params
 * @returns {FolderItem}
 */
export function createFolderItem({
  itemId,
  folderId,
  recordId,
  addedBy,
  addedAt,
}) {
  if (!itemId) throw new Error('itemId is required');
  if (!folderId) throw new Error('folderId is required');
  if (!recordId) throw new Error('recordId is required');
  if (!addedBy) throw new Error('addedBy is required');

  return Object.freeze({
    itemId,
    folderId,
    recordId,
    addedBy,
    addedAt: addedAt || new Date().toISOString(),
  });
}
