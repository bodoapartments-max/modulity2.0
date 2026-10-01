/**
 * Modulity 2.0 — Entity Type Application Service
 *
 * Manages Entity Type registry: CRUD, seeding, validation.
 *
 * @module core/data/entityTypeService
 */

import { createEntityType, ENTITY_TYPE_CATEGORIES, validateFieldDefinition } from './entityType.js';
import { CORE_ENTITY_TYPES } from './coreEntityTypes.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./entityTypeRepository.js').EntityTypeRepository} deps.entityTypeRepo
 */
export function createEntityTypeService({ entityTypeRepo }) {
  /**
   * Seeds all Core Entity Types into a workspace (idempotent).
   */
  async function seedCoreTypes(workspaceId) {
    await Promise.all(
      CORE_ENTITY_TYPES.map((template) => entityTypeRepo.seed(workspaceId, template)),
    );
  }

  /**
   * Creates a Domain Entity Type.
   * Core types cannot be created by users — they are seeded.
   */
  async function createDomainEntityType({ workspaceId, code, name, description = '', icon = '', fields = [], actor }) {
    const existing = await entityTypeRepo.getByCode(workspaceId, code);
    if (existing) {
      throw new AppError('conflict', `Entity type with code "${code}" already exists`);
    }

    for (const field of fields) {
      const result = validateFieldDefinition(field);
      if (!result.valid) {
        throw new AppError('validation_error', `Invalid field "${field.key}": ${result.errors.join(', ')}`);
      }
    }

    const entityType = createEntityType({
      typeId: generateId(),
      code,
      name,
      category: ENTITY_TYPE_CATEGORIES.DOMAIN,
      description,
      icon,
      fields,
      workspaceId,
    });

    const created = await entityTypeRepo.create(entityType);

    eventBus.emit(createEvent({
      eventType: 'entity_type.created',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { typeId: created.typeId, code, name, category: ENTITY_TYPE_CATEGORIES.DOMAIN },
    }));

    return created;
  }

  async function getEntityType(workspaceId, typeId) {
    return entityTypeRepo.getById(workspaceId, typeId);
  }

  async function getEntityTypeByCode(workspaceId, code) {
    return entityTypeRepo.getByCode(workspaceId, code);
  }

  async function listEntityTypes(workspaceId) {
    return entityTypeRepo.listByWorkspace(workspaceId);
  }

  async function listByCategory(workspaceId, category) {
    return entityTypeRepo.listByCategory(workspaceId, category);
  }

  /**
   * Updates a Domain Entity Type's metadata or fields.
   * Core Entity Types cannot be modified by users.
   */
  async function updateEntityType(workspaceId, typeId, changes, actor) {
    const existing = await entityTypeRepo.getById(workspaceId, typeId);
    if (!existing) {
      throw new AppError('not_found', 'Entity type not found');
    }
    if (existing.category === ENTITY_TYPE_CATEGORIES.CORE) {
      throw new AppError('forbidden', 'Core Entity Types cannot be modified');
    }

    const safeChanges = { ...changes };
    delete safeChanges.typeId;
    delete safeChanges.workspaceId;
    delete safeChanges.category;
    delete safeChanges.createdAt;

    if (safeChanges.fields) {
      for (const field of safeChanges.fields) {
        const result = validateFieldDefinition(field);
        if (!result.valid) {
          throw new AppError('validation_error', `Invalid field "${field.key}": ${result.errors.join(', ')}`);
        }
      }
    }

    const updated = await entityTypeRepo.update(workspaceId, typeId, safeChanges);

    eventBus.emit(createEvent({
      eventType: 'entity_type.updated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { typeId, changedFields: Object.keys(safeChanges) },
    }));

    return updated;
  }

  return {
    seedCoreTypes,
    createDomainEntityType,
    getEntityType,
    getEntityTypeByCode,
    listEntityTypes,
    listByCategory,
    updateEntityType,
  };
}
