/**
 * Modulity 2.0 — Record Folder Service
 *
 * Manages folders and user-specific Record state (starred).
 * Folders organize Records without copying them.
 *
 * @module core/data/recordFolderService
 */

import { createFolder, createFolderItem, FOLDER_SCOPES } from './folder.js';
import { createUserRecordState, userRecordStateId } from './userRecordState.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.folderRepo
 * @param {Object} deps.userRecordStateRepo
 */
export function createRecordFolderService({ folderRepo, userRecordStateRepo }) {
  // ─── Folder Operations ─────────────────────────────

  async function createNewFolder({ workspaceId, name, scope = FOLDER_SCOPES.USER, ownerUserId = null, color = null, createdBy }) {
    const folder = createFolder({
      folderId: generateId(),
      workspaceId,
      name,
      scope,
      ownerUserId: scope === FOLDER_SCOPES.USER ? (ownerUserId || createdBy.actorId) : null,
      color,
      createdBy,
    });

    const created = await folderRepo.create(folder);

    eventBus.emit(createEvent({
      eventType: 'folder.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: { folderId: created.folderId, name, scope },
    }));

    return created;
  }

  async function getFolder(workspaceId, folderId) {
    return folderRepo.getById(workspaceId, folderId);
  }

  async function listFolders(workspaceId, userId) {
    return folderRepo.listAccessible(workspaceId, userId);
  }

  async function updateFolder(workspaceId, folderId, changes, actor) {
    const existing = await folderRepo.getById(workspaceId, folderId);
    if (!existing) {
      throw new AppError('not_found', 'Folder not found');
    }
    // Only owner (for USER folders) or workspace member (for WORKSPACE folders) can update
    if (existing.scope === FOLDER_SCOPES.USER && existing.ownerUserId !== actor.actorId) {
      throw new AppError('forbidden', 'You can only modify your own folders');
    }

    const safeChanges = {};
    if (changes.name !== undefined) safeChanges.name = changes.name;
    if (changes.color !== undefined) safeChanges.color = changes.color;
    safeChanges.updatedAt = new Date().toISOString();

    return folderRepo.update(workspaceId, folderId, safeChanges);
  }

  async function deleteFolder(workspaceId, folderId, actor) {
    const existing = await folderRepo.getById(workspaceId, folderId);
    if (!existing) {
      throw new AppError('not_found', 'Folder not found');
    }
    if (existing.scope === FOLDER_SCOPES.USER && existing.ownerUserId !== actor.actorId) {
      throw new AppError('forbidden', 'You can only delete your own folders');
    }

    await folderRepo.remove(workspaceId, folderId);

    eventBus.emit(createEvent({
      eventType: 'folder.deleted',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { folderId },
    }));
  }

  // ─── Folder Item Operations ────────────────────────

  async function addToFolder(workspaceId, folderId, recordId, actor) {
    const folder = await folderRepo.getById(workspaceId, folderId);
    if (!folder) {
      throw new AppError('not_found', 'Folder not found');
    }

    const item = createFolderItem({
      itemId: generateId(),
      folderId,
      recordId,
      addedBy: actor.actorId,
    });

    return folderRepo.addItem(workspaceId, folderId, item);
  }

  async function removeFromFolder(workspaceId, folderId, recordId, actor) {
    const folder = await folderRepo.getById(workspaceId, folderId);
    if (!folder) {
      throw new AppError('not_found', 'Folder not found');
    }
    if (folder.scope === FOLDER_SCOPES.USER && folder.ownerUserId !== actor.actorId) {
      throw new AppError('forbidden', 'You can only modify your own folders');
    }

    return folderRepo.removeItem(workspaceId, folderId, recordId);
  }

  async function listFolderItems(workspaceId, folderId) {
    return folderRepo.listItems(workspaceId, folderId);
  }

  // ─── Starred (User Record State) ──────────────────

  async function toggleStar(workspaceId, userId, recordId) {
    const stateId = userRecordStateId(userId, recordId);
    const existing = await userRecordStateRepo.getById(workspaceId, stateId);

    const newStarred = existing ? !existing.starred : true;
    const state = createUserRecordState({
      workspaceId,
      userId,
      recordId,
      starred: newStarred,
    });

    await userRecordStateRepo.upsert(workspaceId, state);

    eventBus.emit(createEvent({
      eventType: newStarred ? 'record.starred' : 'record.unstarred',
      workspaceId,
      actor: { type: 'user', id: userId },
      payload: { recordId, starred: newStarred },
    }));

    return { recordId, starred: newStarred };
  }

  async function isStarred(workspaceId, userId, recordId) {
    const stateId = userRecordStateId(userId, recordId);
    const state = await userRecordStateRepo.getById(workspaceId, stateId);
    return state?.starred ?? false;
  }

  async function getStarredRecordIds(workspaceId, userId) {
    return userRecordStateRepo.getStarredRecordIds(workspaceId, userId);
  }

  return {
    createFolder: createNewFolder,
    getFolder,
    listFolders,
    updateFolder,
    deleteFolder,
    addToFolder,
    removeFromFolder,
    listFolderItems,
    toggleStar,
    isStarred,
    getStarredRecordIds,
  };
}
