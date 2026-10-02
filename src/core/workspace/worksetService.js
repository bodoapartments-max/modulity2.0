import { generateId } from '../utils/generateId.js';
import { createWorkset, WORKSET_STATUSES } from './workset.js';

export function createWorksetService({ worksetRepo, moduleRepo }) {
  async function validateModules(workspaceId, moduleIds) {
    const modules = await Promise.all(moduleIds.map((id) => moduleRepo.getById(workspaceId, id)));
    if (modules.some((module) => !module)) throw new Error('A selected Module is not available in this workspace');
  }

  async function create(params) {
    await validateModules(params.workspaceId, params.moduleIds || []);
    return worksetRepo.create(createWorkset({ ...params, worksetId: generateId() }));
  }

  async function update(workspaceId, worksetId, changes) {
    const existing = await worksetRepo.getById(workspaceId, worksetId);
    if (!existing) throw new Error('Workset not found');
    if (changes.moduleIds) await validateModules(workspaceId, changes.moduleIds);
    const allowed = ['name', 'description', 'icon', 'moduleIds', 'isDefault', 'category', 'sortOrder', 'metadata'];
    return worksetRepo.update(workspaceId, worksetId, Object.fromEntries(
      Object.entries(changes).filter(([key]) => allowed.includes(key)),
    ));
  }

  async function archive(workspaceId, worksetId) {
    return worksetRepo.update(workspaceId, worksetId, { status: WORKSET_STATUSES.ARCHIVED });
  }

  async function addModule(workspaceId, worksetId, moduleId) {
    const existing = await worksetRepo.getById(workspaceId, worksetId);
    if (!existing) throw new Error('Workset not found');
    return update(workspaceId, worksetId, { moduleIds: [...existing.moduleIds, moduleId] });
  }

  async function removeModule(workspaceId, worksetId, moduleId) {
    const existing = await worksetRepo.getById(workspaceId, worksetId);
    if (!existing) throw new Error('Workset not found');
    return update(workspaceId, worksetId, { moduleIds: existing.moduleIds.filter((id) => id !== moduleId) });
  }

  return {
    create, update, archive, addModule, removeModule,
    get: worksetRepo.getById,
    list: worksetRepo.listByWorkspace,
  };
}
