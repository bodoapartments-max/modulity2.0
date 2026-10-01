/**
 * Modulity 2.0 — Relationship Application Service
 *
 * Validates endpoint existence and workspace consistency.
 *
 * @module core/data/relationshipService
 */

import { createRelationship, RELATIONSHIP_STATUSES, RELATIONSHIP_OBJECT_TYPES } from './relationship.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./relationshipRepository.js').RelationshipRepository} deps.relationshipRepo
 * @param {import('./entityRepository.js').EntityRepository} deps.entityRepo
 */
export function createRelationshipService({ relationshipRepo, entityRepo }) {
  /**
   * Validates that a relationship endpoint exists in the given workspace.
   * Currently only ENTITY endpoints are fully validated.
   */
  async function validateEndpoint(workspaceId, endpoint) {
    if (endpoint.objectType === RELATIONSHIP_OBJECT_TYPES.ENTITY) {
      const entity = await entityRepo.getById(workspaceId, endpoint.objectId);
      if (!entity) {
        throw new AppError('not_found', `Entity not found: ${endpoint.objectId}`);
      }
    }
  }

  async function createNewRelationship({ workspaceId, source, relationshipType, target, metadata = {}, createdBy }) {
    await Promise.all([
      validateEndpoint(workspaceId, source),
      validateEndpoint(workspaceId, target),
    ]);

    const rel = createRelationship({
      relationshipId: generateId(),
      workspaceId,
      source,
      relationshipType,
      target,
      metadata,
      createdBy,
    });

    const created = await relationshipRepo.create(rel);

    eventBus.emit(createEvent({
      eventType: 'relationship.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: {
        relationshipId: created.relationshipId,
        relationshipType,
        source,
        target,
      },
    }));

    return created;
  }

  async function getRelationship(workspaceId, relationshipId) {
    return relationshipRepo.getById(workspaceId, relationshipId);
  }

  async function listRelationshipsForObject(workspaceId, objectType, objectId) {
    return relationshipRepo.listForObject(workspaceId, objectType, objectId);
  }

  async function archiveRelationship(workspaceId, relationshipId, actor) {
    const existing = await relationshipRepo.getById(workspaceId, relationshipId);
    if (!existing) {
      throw new AppError('not_found', 'Relationship not found');
    }

    const updated = await relationshipRepo.update(
      workspaceId,
      relationshipId,
      { status: RELATIONSHIP_STATUSES.ARCHIVED },
    );

    eventBus.emit(createEvent({
      eventType: 'relationship.archived',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { relationshipId },
    }));

    return updated;
  }

  return {
    createRelationship: createNewRelationship,
    getRelationship,
    listRelationshipsForObject,
    archiveRelationship,
  };
}
