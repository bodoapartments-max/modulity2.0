import { createActorRef } from '../data/actorRef.js';

export const WORKSET_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });

export function createWorkset({
  worksetId, workspaceId, name, description = '', icon = 'briefcase', moduleIds = [],
  isDefault = false, status = WORKSET_STATUSES.ACTIVE, category = null, sortOrder = 0,
  metadata = {}, createdBy, createdAt = null, updatedAt = null,
}) {
  if (!worksetId) throw new Error('worksetId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!name?.trim()) throw new Error('Workset name is required');
  if (!Object.values(WORKSET_STATUSES).includes(status)) throw new Error(`Invalid Workset status: ${status}`);
  if (!Array.isArray(moduleIds) || moduleIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('moduleIds must contain valid Module IDs');
  }
  createActorRef(createdBy);
  return Object.freeze({
    worksetId, workspaceId, name: name.trim(), description: description.trim(), icon,
    moduleIds: Object.freeze([...new Set(moduleIds)]), isDefault: Boolean(isDefault), status,
    category, sortOrder, metadata: Object.freeze({ ...metadata }),
    createdBy: Object.freeze({ ...createdBy }), createdAt, updatedAt,
  });
}
