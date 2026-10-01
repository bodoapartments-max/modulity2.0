/**
 * Modulity 2.0 — Entity Application Service
 *
 * React-independent service for Entity CRUD and lifecycle.
 * All operations require explicit workspaceId — never read from React context.
 *
 * @module core/data/entityService
 */

import { createEntity, ENTITY_STATUSES, validateEntityReference } from './entity.js';
import { validateEntityData, ENTITY_TYPE_STATUSES } from './entityType.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./entityRepository.js').EntityRepository} deps.entityRepo
 * @param {import('./entityTypeRepository.js').EntityTypeRepository} deps.entityTypeRepo
 */
export function createEntityService({ entityRepo, entityTypeRepo }) {
  /**
   * Creates a new Entity after validating against its EntityType schema.
   * Entity Type must exist and be ACTIVE.
   */
  async function createNewEntity({ workspaceId, entityTypeId, displayName, data = {}, attachments = [], sourceRecordId = null, createdBy }) {
    const entityType = await entityTypeRepo.getById(workspaceId, entityTypeId);
    if (!entityType) {
      throw new AppError('not_found', `Entity type not found: ${entityTypeId}`);
    }

    if (entityType.status !== ENTITY_TYPE_STATUSES.ACTIVE) {
      throw new AppError('forbidden', `Cannot create entity with ${entityType.status} entity type: ${entityTypeId}`);
    }

    if (entityType.fields && entityType.fields.length > 0) {
      const validation = validateEntityData(data, entityType.fields);
      if (!validation.valid) {
        throw new AppError('validation_error', 'Entity data validation failed', validation.errors);
      }
    }

    const entity = createEntity({
      entityId: generateId(),
      workspaceId,
      entityTypeId,
      displayName,
      data,
      attachments,
      sourceRecordId,
      createdBy,
    });

    const created = await entityRepo.create(entity);

    eventBus.emit(createEvent({
      eventType: 'entity.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: { entityId: created.entityId, entityTypeId, displayName },
    }));

    return created;
  }

  async function getEntity(workspaceId, entityId) {
    return entityRepo.getById(workspaceId, entityId);
  }

  /**
   * Updates an Entity. If data changes, re-validates against Entity Type schema.
   */
  async function updateEntity(workspaceId, entityId, changes, actor) {
    const existing = await entityRepo.getById(workspaceId, entityId);
    if (!existing) {
      throw new AppError('not_found', 'Entity not found');
    }

    const safeChanges = { ...changes };
    delete safeChanges.entityId;
    delete safeChanges.workspaceId;
    delete safeChanges.entityTypeId;
    delete safeChanges.createdBy;
    delete safeChanges.createdAt;

    // Re-validate data against Entity Type schema when data changes
    if (safeChanges.data !== undefined) {
      const entityType = await entityTypeRepo.getById(workspaceId, existing.entityTypeId);
      if (entityType && entityType.fields && entityType.fields.length > 0) {
        const validation = validateEntityData(safeChanges.data, entityType.fields);
        if (!validation.valid) {
          throw new AppError('validation_error', 'Entity data validation failed', validation.errors);
        }
      }
    }

    const updated = await entityRepo.update(workspaceId, entityId, safeChanges);

    eventBus.emit(createEvent({
      eventType: 'entity.updated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { entityId, changedFields: Object.keys(safeChanges) },
    }));

    return updated;
  }

  async function archiveEntity(workspaceId, entityId, actor) {
    return updateEntity(workspaceId, entityId, { status: ENTITY_STATUSES.ARCHIVED }, actor);
  }

  async function listEntities(workspaceId, filters = {}) {
    if (filters.entityTypeId) {
      return entityRepo.listByType(workspaceId, filters.entityTypeId);
    }
    return entityRepo.query(workspaceId, filters);
  }

  /**
   * Resolves a single entity reference, enforcing workspace isolation and type integrity.
   * Verifies: workspace match, entity existence, entityTypeId match.
   */
  async function resolveEntityReference(ref, callerWorkspaceId) {
    // Structural validation
    const structResult = validateEntityReference(ref);
    if (!structResult.valid) {
      throw new AppError('validation_error', 'Invalid entity reference', structResult.errors);
    }

    if (ref.workspaceId !== callerWorkspaceId) {
      throw new AppError('forbidden', 'Cross-workspace entity reference is denied');
    }
    const entity = await entityRepo.getById(ref.workspaceId, ref.entityId);
    if (!entity) {
      throw new AppError('not_found', `Entity not found: ${ref.entityId}`);
    }

    // Entity Type integrity: ref must match the actual entity's type
    if (ref.entityTypeId !== entity.entityTypeId) {
      throw new AppError('validation_error',
        `Entity type mismatch: reference claims ${ref.entityTypeId} but entity is ${entity.entityTypeId}`);
    }

    return entity;
  }

  /**
   * Resolves multiple entity references, enforcing workspace isolation and type integrity.
   */
  async function resolveEntityReferences(refs, callerWorkspaceId) {
    return Promise.all(refs.map((ref) => resolveEntityReference(ref, callerWorkspaceId)));
  }

  return {
    createEntity: createNewEntity,
    getEntity,
    updateEntity,
    archiveEntity,
    listEntities,
    resolveEntityReference,
    resolveEntityReferences,
  };
}
