/**
 * Modulity 2.0 — Module Application Service
 *
 * React-independent service for Module CRUD and lifecycle.
 * All operations require explicit workspaceId.
 *
 * @module modules/moduleService
 */

import { createModule, MODULE_STATUSES, validateModuleCode } from './module.js';
import { validateFormSchema } from './forms/formSchemaValidator.js';
import { generateId } from '../core/utils/generateId.js';
import { eventBus, createEvent } from '../core/events/eventBus.js';
import { AppError } from '../core/errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./moduleRepository.js').ModuleRepository} deps.moduleRepo
 */
export function createModuleService({ moduleRepo }) {
  /**
   * Creates a new Module in DRAFT status.
   */
  async function createNewModule({
    workspaceId,
    moduleCode,
    name,
    description = '',
    category = '',
    formSchema = { schemaVersion: '1.0.0', fields: [] },
    displayConfig = {},
    primaryEntityTypeId = null,
    createdBy,
  }) {
    // Validate module code format
    const codeResult = validateModuleCode(moduleCode);
    if (!codeResult.valid) {
      throw new AppError('validation_error', codeResult.errors.join('; '));
    }

    // Check uniqueness within workspace
    const existing = await moduleRepo.getByCode(workspaceId, moduleCode);
    if (existing) {
      throw new AppError('conflict', `Module with code "${moduleCode}" already exists in this workspace`);
    }

    // Validate form schema if fields present
    if (formSchema.fields && formSchema.fields.length > 0) {
      const schemaResult = validateFormSchema(formSchema);
      if (!schemaResult.valid) {
        throw new AppError('validation_error', `Invalid form schema: ${schemaResult.errors.join('; ')}`);
      }
    }

    const mod = createModule({
      moduleId: generateId(),
      workspaceId,
      moduleCode,
      name,
      description,
      category,
      status: MODULE_STATUSES.DRAFT,
      version: 1,
      formSchema,
      recordConfig: { recordType: moduleCode },
      displayConfig,
      primaryEntityTypeId,
      createdBy,
    });

    const created = await moduleRepo.create(mod);

    eventBus.emit(createEvent({
      eventType: 'module.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: { moduleId: created.moduleId, moduleCode, name },
    }));

    return created;
  }

  async function getModule(workspaceId, moduleId) {
    return moduleRepo.getById(workspaceId, moduleId);
  }

  async function getModuleByCode(workspaceId, moduleCode) {
    return moduleRepo.getByCode(workspaceId, moduleCode);
  }

  async function listModules(workspaceId) {
    return moduleRepo.listByWorkspace(workspaceId);
  }

  /**
   * Updates a DRAFT Module. ACTIVE modules require version increment.
   */
  async function updateModule(workspaceId, moduleId, changes, actor) {
    const existing = await moduleRepo.getById(workspaceId, moduleId);
    if (!existing) {
      throw new AppError('not_found', 'Module not found');
    }
    if (existing.status === MODULE_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Archived modules cannot be modified');
    }

    const safeChanges = { ...changes };
    // Immutable fields
    delete safeChanges.moduleId;
    delete safeChanges.workspaceId;
    delete safeChanges.moduleCode;
    delete safeChanges.createdBy;
    delete safeChanges.createdAt;

    // If form schema changes on an ACTIVE module, increment version
    if (safeChanges.formSchema && existing.status === MODULE_STATUSES.ACTIVE) {
      safeChanges.version = existing.version + 1;
    }

    // Validate new form schema if provided
    if (safeChanges.formSchema) {
      const schema = safeChanges.formSchema;
      if (schema.fields && schema.fields.length > 0) {
        const schemaResult = validateFormSchema(schema);
        if (!schemaResult.valid) {
          throw new AppError('validation_error', `Invalid form schema: ${schemaResult.errors.join('; ')}`);
        }
      }
    }

    safeChanges.updatedAt = new Date().toISOString();
    const updated = await moduleRepo.update(workspaceId, moduleId, safeChanges);

    eventBus.emit(createEvent({
      eventType: 'module.updated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { moduleId, changedFields: Object.keys(safeChanges) },
    }));

    return updated;
  }

  /**
   * Activates a DRAFT or INACTIVE Module.
   * Form schema must have at least one field.
   */
  async function activateModule(workspaceId, moduleId, actor) {
    const existing = await moduleRepo.getById(workspaceId, moduleId);
    if (!existing) {
      throw new AppError('not_found', 'Module not found');
    }
    if (existing.status === MODULE_STATUSES.ACTIVE) {
      return existing; // Already active, idempotent
    }
    if (existing.status === MODULE_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Archived modules cannot be activated');
    }

    // Validate form schema is complete
    if (!existing.formSchema || !existing.formSchema.fields || existing.formSchema.fields.length === 0) {
      throw new AppError('validation_error', 'Module must have at least one form field before activation');
    }

    const schemaResult = validateFormSchema(existing.formSchema);
    if (!schemaResult.valid) {
      throw new AppError('validation_error', `Invalid form schema: ${schemaResult.errors.join('; ')}`);
    }

    const updated = await moduleRepo.update(workspaceId, moduleId, {
      status: MODULE_STATUSES.ACTIVE,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'module.activated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { moduleId, moduleCode: existing.moduleCode },
    }));

    return updated;
  }

  /**
   * Deactivates an ACTIVE Module.
   */
  async function deactivateModule(workspaceId, moduleId, actor) {
    const existing = await moduleRepo.getById(workspaceId, moduleId);
    if (!existing) {
      throw new AppError('not_found', 'Module not found');
    }
    if (existing.status !== MODULE_STATUSES.ACTIVE) {
      throw new AppError('forbidden', 'Only active modules can be deactivated');
    }

    const updated = await moduleRepo.update(workspaceId, moduleId, {
      status: MODULE_STATUSES.INACTIVE,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'module.deactivated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { moduleId },
    }));

    return updated;
  }

  /**
   * Archives a Module. Preserves for historical Record interpretation.
   */
  async function archiveModule(workspaceId, moduleId, actor) {
    const existing = await moduleRepo.getById(workspaceId, moduleId);
    if (!existing) {
      throw new AppError('not_found', 'Module not found');
    }
    if (existing.status === MODULE_STATUSES.ARCHIVED) {
      return existing; // Idempotent
    }

    const updated = await moduleRepo.update(workspaceId, moduleId, {
      status: MODULE_STATUSES.ARCHIVED,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'module.archived',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { moduleId },
    }));

    return updated;
  }

  return {
    createModule: createNewModule,
    getModule,
    getModuleByCode,
    listModules,
    updateModule,
    activateModule,
    deactivateModule,
    archiveModule,
  };
}
