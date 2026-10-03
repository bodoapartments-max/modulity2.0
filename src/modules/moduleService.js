/**
 * Modulity 2.0 — Module Application Service
 *
 * React-independent service for Module CRUD and lifecycle.
 * All operations require explicit workspaceId.
 *
 * Version lifecycle:
 *   DRAFT → editable without creating version snapshots
 *   First activation → creates immutable Version 1 snapshot
 *   ACTIVE schema change → creates next immutable version snapshot
 *   ARCHIVED → preserved for historical Record interpretation
 *
 * Code uniqueness:
 *   Atomic reservation via workspaces/{workspaceId}/moduleCodes/{code}
 *   Codes are NEVER reused, even after archiving.
 *
 * @module modules/moduleService
 */

import { createModule, MODULE_STATUSES, validateModuleCode } from './module.js';
import { createModuleVersionSnapshot } from './moduleVersion.js';
import { validateFormSchema } from './forms/formSchemaValidator.js';
import { generateId } from '../core/utils/generateId.js';
import { eventBus, createEvent } from '../core/events/eventBus.js';
import { AppError } from '../core/errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./moduleRepository.js').ModuleRepository} deps.moduleRepo
 */
export function createModuleService({ moduleRepo, entityTypeRepo = null }) {
  async function validateEntityTypeReferences(workspaceId, formSchema) {
    if (!entityTypeRepo) return;
    const references = [...new Set((formSchema?.fields || []).filter((field) => field.type === 'entity-reference').map((field) => field.entityTypeId))];
    for (const reference of references) {
      const entityType = String(reference).startsWith('entityType:') && entityTypeRepo.getByCode ? await entityTypeRepo.getByCode(workspaceId, String(reference).slice('entityType:'.length)) : await entityTypeRepo.getById(workspaceId, reference);
      if (!entityType) throw new AppError('validation_error', `Entity Type reference is not available in this Workspace: ${reference}`);
    }
  }
  /**
   * Creates a new Module in DRAFT status with atomic code reservation.
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

    // Check atomic code reservation if supported
    if (moduleRepo.isCodeReserved) {
      const reservation = await moduleRepo.isCodeReserved(workspaceId, moduleCode);
      if (reservation) {
        throw new AppError('conflict', `Module with code "${moduleCode}" already exists in this workspace`);
      }
    } else {
      // Fallback: query-based check (legacy, race condition possible)
      const existing = await moduleRepo.getByCode(workspaceId, moduleCode);
      if (existing) {
        throw new AppError('conflict', `Module with code "${moduleCode}" already exists in this workspace`);
      }
    }

    // Validate form schema if fields present
    if (formSchema.fields && formSchema.fields.length > 0) {
      const schemaResult = validateFormSchema(formSchema);
      if (!schemaResult.valid) {
        throw new AppError('validation_error', `Invalid form schema: ${schemaResult.errors.join('; ')}`);
      }
    }

    await validateEntityTypeReferences(workspaceId, formSchema);

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

    // Atomic: create module + reserve code in one batch
    let created;
    if (moduleRepo.createModuleWithCodeReservation) {
      created = await moduleRepo.createModuleWithCodeReservation(mod);
    } else {
      created = await moduleRepo.create(mod);
    }

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
   * Updates a Module. Schema changes on ACTIVE modules create new version snapshots.
   *
   * DRAFT: freely editable, no version snapshots created.
   * ACTIVE: schema change → increment version + create immutable snapshot.
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

    // Validate new form schema if provided
    if (safeChanges.formSchema) {
      const schema = safeChanges.formSchema;
      if (schema.fields && schema.fields.length > 0) {
        const schemaResult = validateFormSchema(schema);
        if (!schemaResult.valid) {
          throw new AppError('validation_error', `Invalid form schema: ${schemaResult.errors.join('; ')}`);
        }
      }
      await validateEntityTypeReferences(workspaceId, schema);
    }

    // If form schema changes on an ACTIVE module, increment version and create snapshot
    if (safeChanges.formSchema && existing.status === MODULE_STATUSES.ACTIVE) {
      const newVersion = existing.version + 1;
      safeChanges.version = newVersion;
      safeChanges.updatedAt = new Date().toISOString();

      // Merge changes into a full module snapshot
      const mergedModule = {
        ...existing,
        ...safeChanges,
        version: newVersion,
      };

      // Create immutable version snapshot atomically with module update
      const snapshot = createModuleVersionSnapshot({
        moduleId,
        workspaceId,
        version: newVersion,
        moduleCode: existing.moduleCode,
        name: mergedModule.name || existing.name,
        formSchema: mergedModule.formSchema,
        recordConfig: mergedModule.recordConfig || existing.recordConfig,
        displayConfig: mergedModule.displayConfig || existing.displayConfig,
        primaryEntityTypeId: mergedModule.primaryEntityTypeId ?? existing.primaryEntityTypeId,
        createdBy: actor,
      });

      if (moduleRepo.createVersionSnapshot) {
        await moduleRepo.createVersionSnapshot(workspaceId, moduleId, snapshot, safeChanges);
      } else {
        await moduleRepo.update(workspaceId, moduleId, safeChanges);
      }

      eventBus.emit(createEvent({
        eventType: 'module.version_created',
        workspaceId,
        actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
        payload: { moduleId, version: newVersion, moduleCode: existing.moduleCode },
      }));

      // Return the updated module
      return moduleRepo.getById(workspaceId, moduleId);
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
   * First activation creates immutable Version 1 snapshot.
   * Re-activation from INACTIVE creates a new version snapshot if schema changed.
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

    await validateEntityTypeReferences(workspaceId, existing.formSchema);

    // Create immutable version snapshot
    const snapshot = createModuleVersionSnapshot({
      moduleId,
      workspaceId,
      version: existing.version,
      moduleCode: existing.moduleCode,
      name: existing.name,
      formSchema: existing.formSchema,
      recordConfig: existing.recordConfig,
      displayConfig: existing.displayConfig,
      primaryEntityTypeId: existing.primaryEntityTypeId,
      createdBy: actor,
    });

    const moduleUpdates = {
      status: MODULE_STATUSES.ACTIVE,
      updatedAt: new Date().toISOString(),
    };

    if (moduleRepo.createVersionSnapshot) {
      await moduleRepo.createVersionSnapshot(workspaceId, moduleId, snapshot, moduleUpdates);
    } else {
      await moduleRepo.update(workspaceId, moduleId, moduleUpdates);
    }

    eventBus.emit(createEvent({
      eventType: 'module.activated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { moduleId, moduleCode: existing.moduleCode, version: existing.version },
    }));

    // Return the updated module
    return moduleRepo.getById(workspaceId, moduleId);
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
   * Module code reservation is NOT released — codes are never reused.
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

  /**
   * Retrieves a specific Module Version snapshot.
   * Used for historical Record interpretation.
   */
  async function getModuleVersion(workspaceId, moduleId, version) {
    if (!moduleRepo.getVersionSnapshot) return null;
    return moduleRepo.getVersionSnapshot(workspaceId, moduleId, version);
  }

  /**
   * Lists all version snapshots for a Module.
   */
  async function listModuleVersions(workspaceId, moduleId) {
    if (!moduleRepo.listVersionSnapshots) return [];
    return moduleRepo.listVersionSnapshots(workspaceId, moduleId);
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
    getModuleVersion,
    listModuleVersions,
  };
}
