/**
 * Modulity 2.0 — Capability Definition Service
 *
 * Application service for creating, updating, and listing CapabilityDefinitions.
 * Enforces workspace authorization: personal owner or org OWNER/ADMIN.
 */

import { AppError } from '../errors/appError.js';
import { generateId } from '../utils/generateId.js';
import { createCapabilityDefinitionDocument, normalizeCapabilityDefinitionUpdates } from './capabilityDefinition.js';
import { createCapabilitySourceRef } from './capabilityContracts.js';

function canManage(workspace, membership) {
  if (!workspace) return false;
  if (workspace.type === 'PERSONAL') return workspace.ownerUserId === membership?.userId;
  if (workspace.type === 'ORGANIZATION') {
    return membership?.status === 'ACTIVE' && (membership.roles.includes('OWNER') || membership.roles.includes('ADMIN'));
  }
  return false;
}

export function createCapabilityDefinitionService({ capabilityDefinitionRepo, moduleRepo, entityTypeRepo }) {
  async function assertManageAuthorization(workspace, membership) {
    if (!canManage(workspace, membership)) {
      throw new AppError('forbidden', 'Only the Workspace owner or an Organization OWNER/ADMIN may manage capability definitions.');
    }
  }

  async function resolveSource(workspaceId, source) {
    const ref = createCapabilitySourceRef(source, workspaceId);
    if (ref.kind === 'MODULE') {
      const moduleCode = ref.ref.replace('module:', '');
      const mod = await moduleRepo.getByCode(workspaceId, moduleCode);
      if (!mod) return null;
      return { kind: 'MODULE', workspaceId, moduleCode, moduleId: mod.moduleId, formSchema: mod.formSchema, status: mod.status };
    }
    if (ref.kind === 'ENTITY_TYPE') {
      const entityTypeId = ref.ref.replace('entityType:', '');
      const entityType = entityTypeRepo?.getById ? await entityTypeRepo.getById(workspaceId, entityTypeId) : null;
      if (!entityType) return null;
      return { kind: 'ENTITY_TYPE', workspaceId, entityTypeId, fields: entityType.fields };
    }
    return null;
  }

  async function createDefinition({ workspace, membership, engineId, name, description, source, configuration, status, createdBy }) {
    await assertManageAuthorization(workspace, membership);
    const resolved = await resolveSource(workspace.workspaceId, source);
    if (!resolved) throw new AppError('not_found', 'Capability source not found');

    const definition = createCapabilityDefinitionDocument({
      definitionId: generateId(),
      workspaceId: workspace.workspaceId,
      engineId,
      name,
      description,
      source,
      configuration,
      status,
      createdBy,
    });

    return capabilityDefinitionRepo.create(definition);
  }

  async function updateDefinition({ workspace, membership, definitionId, changes }) {
    await assertManageAuthorization(workspace, membership);
    const existing = await capabilityDefinitionRepo.getById(workspace.workspaceId, definitionId);
    if (!existing) throw new AppError('not_found', 'Capability definition not found');
    const safeChanges = normalizeCapabilityDefinitionUpdates(existing, changes);
    if (safeChanges.source) {
      const resolved = await resolveSource(workspace.workspaceId, safeChanges.source);
      if (!resolved) throw new AppError('not_found', 'Capability source not found');
    }
    return capabilityDefinitionRepo.update(workspace.workspaceId, definitionId, safeChanges);
  }

  async function setStatus({ workspace, membership, definitionId, status }) {
    return updateDefinition({ workspace, membership, definitionId, changes: { status } });
  }

  async function deleteDefinition({ workspace, membership, definitionId }) {
    await assertManageAuthorization(workspace, membership);
    const existing = await capabilityDefinitionRepo.getById(workspace.workspaceId, definitionId);
    if (!existing) throw new AppError('not_found', 'Capability definition not found');
    return capabilityDefinitionRepo.deleteDefinition(workspace.workspaceId, definitionId);
  }

  async function getDefinition(workspace, definitionId) {
    return capabilityDefinitionRepo.getById(workspace.workspaceId, definitionId);
  }

  async function listDefinitions(workspace, options = {}) {
    return capabilityDefinitionRepo.listByWorkspace(workspace.workspaceId, options);
  }

  async function listDefinitionsByEngine(workspace, engineId, options = {}) {
    return capabilityDefinitionRepo.listByEngine(workspace.workspaceId, engineId, options);
  }

  return {
    createDefinition,
    updateDefinition,
    setStatus,
    deleteDefinition,
    getDefinition,
    listDefinitions,
    listDefinitionsByEngine,
    canManage,
  };
}
