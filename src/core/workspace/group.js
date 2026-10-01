/**
 * Modulity 2.0 — Group Domain Model
 *
 * A Group is a reusable organization-level grouping concept.
 * Examples: Management, Reception, Maintenance, Teachers.
 *
 * Groups do not have Modules or permissions attached yet.
 */

/**
 * @typedef {Object} Group
 * @property {string} groupId
 * @property {string} organizationId
 * @property {string} name
 * @property {string} description
 * @property {string} createdAt       — ISO 8601
 * @property {string} updatedAt       — ISO 8601
 */

/**
 * Creates a Group value object.
 *
 * @param {Object} params
 * @returns {Group}
 */
export function createGroup({
  groupId,
  organizationId,
  name,
  description = '',
  createdAt,
  updatedAt,
}) {
  if (!groupId) throw new Error('groupId is required');
  if (!organizationId) throw new Error('organizationId is required');
  if (!name || name.trim() === '') throw new Error('Group name is required');

  return Object.freeze({
    groupId,
    organizationId,
    name: name.trim(),
    description: description.trim(),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}
