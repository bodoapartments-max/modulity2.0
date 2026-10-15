/**
 * Modulity 2.0 — Group Application Service
 *
 * Manages organization-level groups. React-independent.
 */

import { createGroup } from './group.js';
import { generateId } from '../utils/generateId.js';
import { hasCapability } from './role.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./groupRepository.js').GroupRepository} deps.groupRepo
 * @returns {Object}
 */
export function createGroupService({ groupRepo }) {
  /**
   * Creates a new group.
   *
   * @param {Object} params
   * @param {string} params.organizationId
   * @param {string} params.name
   * @param {string} params.description
   * @param {string} params.userId  — acting user
   * @param {string[]} params.roles — acting user's roles
   * @returns {Promise<Group>}
   */
  async function createNewGroup({ organizationId, name, description = '', userId, roles }) {
    if (!hasCapability(roles, 'groups.create')) {
      throw new AppError('forbidden', 'You do not have permission to create groups.');
    }

    const group = createGroup({
      groupId: generateId(),
      organizationId,
      name,
      description,
    });

    const created = await groupRepo.create(group);

    eventBus.emit(createEvent({
      eventType: 'group.created',
      organizationId,
      actor: { type: 'user', id: userId },
      payload: { groupId: created.groupId, name },
    }));

    return created;
  }

  /**
   * Renames or updates a group.
   */
  async function updateGroup(groupId, updates, userId, roles, organizationId) {
    if (!hasCapability(roles, 'groups.edit')) {
      throw new AppError('forbidden', 'You do not have permission to edit groups.');
    }

    const updated = await groupRepo.update(groupId, updates, organizationId);

    eventBus.emit(createEvent({
      eventType: 'group.updated',
      organizationId,
      actor: { type: 'user', id: userId },
      payload: { groupId, changedFields: Object.keys(updates) },
    }));

    return updated;
  }

  /**
   * Deletes a group.
   */
  async function deleteGroup(groupId, userId, roles, organizationId) {
    if (!hasCapability(roles, 'groups.delete')) {
      throw new AppError('forbidden', 'You do not have permission to delete groups.');
    }

    await groupRepo.remove(groupId, organizationId);

    eventBus.emit(createEvent({
      eventType: 'group.deleted',
      organizationId,
      actor: { type: 'user', id: userId },
      payload: { groupId },
    }));
  }

  /**
   * Adds a workspace member to the group (no-op if already present).
   * Group membership is organizational labeling, not authorization.
   */
  async function addGroupMember(groupId, memberUserId, userId, roles, organizationId) {
    if (!hasCapability(roles, 'groups.edit')) {
      throw new AppError('forbidden', 'You do not have permission to edit groups.');
    }
    if (!memberUserId) throw new AppError('validation_error', 'memberUserId is required');
    const existing = await groupRepo.getById(groupId, organizationId);
    if (!existing) throw new AppError('not_found', 'Group not found.');
    const next = [...new Set([...(existing.memberIds || []), memberUserId])];
    return groupRepo.update(groupId, { memberIds: next }, organizationId);
  }

  /**
   * Removes a workspace member from the group.
   */
  async function removeGroupMember(groupId, memberUserId, userId, roles, organizationId) {
    if (!hasCapability(roles, 'groups.edit')) {
      throw new AppError('forbidden', 'You do not have permission to edit groups.');
    }
    if (!memberUserId) throw new AppError('validation_error', 'memberUserId is required');
    const existing = await groupRepo.getById(groupId, organizationId);
    if (!existing) throw new AppError('not_found', 'Group not found.');
    const next = (existing.memberIds || []).filter((id) => id !== memberUserId);
    return groupRepo.update(groupId, { memberIds: next }, organizationId);
  }

  /**
   * Gets all groups for an organization.
   */
  async function getOrganizationGroups(organizationId) {
    return groupRepo.getByOrganization(organizationId);
  }

  return {
    createNewGroup,
    updateGroup,
    deleteGroup,
    getOrganizationGroups,
    addGroupMember,
    removeGroupMember,
  };
}
