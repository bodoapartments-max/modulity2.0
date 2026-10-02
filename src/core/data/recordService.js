/**
 * Modulity 2.0 — Record Application Service (Foundation)
 *
 * For Step 3: create, get, update draft, archive/cancel, validate entity references.
 * Full Module-driven Record creation comes in later steps.
 *
 * @module core/data/recordService
 */

import { createRecord, RECORD_STATUSES } from './record.js';
import { validateEntityReference } from './entity.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * Derives a flat array of entity IDs from canonical EntityReference objects.
 * This is used as a denormalized index field for array-contains queries.
 * The canonical references remain the source of truth.
 *
 * @param {import('./entity.js').EntityReference[]} refs
 * @returns {string[]}
 */
export function deriveEntityReferenceIds(refs) {
  return refs.map((r) => r.entityId);
}

/**
 * @param {Object} deps
 * @param {import('./recordRepository.js').RecordRepository} deps.recordRepo
 * @param {import('./entityRepository.js').EntityRepository} deps.entityRepo
 */
export function createRecordService({ recordRepo, entityRepo }) {
  /**
   * Validates entity references: structure, workspace isolation, existence, type integrity.
   */
  async function validateEntityReferences(workspaceId, entityReferences) {
    for (const ref of entityReferences) {
      // Structural validation using canonical validator
      const structResult = validateEntityReference(ref);
      if (!structResult.valid) {
        throw new AppError('validation_error', `Invalid entity reference: ${structResult.errors.join(', ')}`);
      }

      if (ref.workspaceId !== workspaceId) {
        throw new AppError('forbidden', `Cross-workspace entity reference denied: ${ref.entityId}`);
      }
      const entity = await entityRepo.getById(ref.workspaceId, ref.entityId);
      if (!entity) {
        throw new AppError('not_found', `Referenced entity not found: ${ref.entityId}`);
      }

      // Entity Type integrity: ref must match the actual entity's type
      if (ref.entityTypeId !== entity.entityTypeId) {
        throw new AppError('validation_error',
          `Entity type mismatch: reference claims ${ref.entityTypeId} but entity is ${entity.entityTypeId}`);
      }
    }
  }

  async function createNewRecord({
    workspaceId,
    recordType,
    moduleId = null,
    moduleVersion = null,
    status = RECORD_STATUSES.DRAFT,
    priority = null,
    createdBy,
    submittedBy = null,
    data = {},
    entityReferences = [],
    attachments = [],
    submittedAt = null,
  }) {
    if (entityReferences.length > 0) {
      await validateEntityReferences(workspaceId, entityReferences);
    }

    // Derive ID index from canonical references
    const entityReferenceIds = deriveEntityReferenceIds(entityReferences);

    const record = createRecord({
      recordId: generateId(),
      workspaceId,
      moduleId,
      moduleVersion,
      recordType,
      status,
      priority,
      createdBy,
      submittedBy,
      data,
      entityReferences,
      entityReferenceIds,
      attachments,
      submittedAt,
    });

    const created = await recordRepo.create(record);

    eventBus.emit(createEvent({
      eventType: 'record.created',
      workspaceId,
      actor: { type: createdBy.actorType === 'USER' ? 'user' : 'service', id: createdBy.actorId },
      payload: { recordId: created.recordId, recordType, status },
    }));

    return created;
  }

  async function getRecord(workspaceId, recordId) {
    return recordRepo.getById(workspaceId, recordId);
  }

  /**
   * Updates a draft Record. Re-validates entityReferences if changed.
   * Derives entityReferenceIds from canonical references when references change.
   */
  async function updateDraftRecord(workspaceId, recordId, changes, actor) {
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) {
      throw new AppError('not_found', 'Record not found');
    }
    if (existing.status !== RECORD_STATUSES.DRAFT) {
      throw new AppError('forbidden', 'Only draft records can be updated');
    }

    const safeChanges = { ...changes };
    delete safeChanges.recordId;
    delete safeChanges.workspaceId;
    delete safeChanges.createdBy;
    delete safeChanges.createdAt;
    // Module provenance fields are immutable after creation
    delete safeChanges.moduleId;
    delete safeChanges.moduleVersion;
    delete safeChanges.recordType;
    // Source request provenance is immutable
    delete safeChanges.sourceRequestId;
    // Ledger linkage is immutable after assignment
    delete safeChanges.ledgerEntryId;
    delete safeChanges.ledgerBookId;
    delete safeChanges.referenceNumber;

    // Re-validate entity references if changed
    if (safeChanges.entityReferences !== undefined) {
      const refs = safeChanges.entityReferences;
      if (!Array.isArray(refs)) {
        throw new AppError('validation_error', 'entityReferences must be an array');
      }
      if (refs.length > 0) {
        await validateEntityReferences(workspaceId, refs);
      }
      // Re-derive ID index from new canonical references
      safeChanges.entityReferenceIds = deriveEntityReferenceIds(refs);
    }

    const updated = await recordRepo.update(workspaceId, recordId, safeChanges);

    eventBus.emit(createEvent({
      eventType: 'record.updated',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId, changedFields: Object.keys(safeChanges) },
    }));

    return updated;
  }

  async function cancelRecord(workspaceId, recordId, actor) {
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) throw new AppError('not_found', 'Record not found');
    if (existing.status === RECORD_STATUSES.CANCELLED || existing.status === RECORD_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Record is already cancelled or archived');
    }

    const updated = await recordRepo.update(workspaceId, recordId, { status: RECORD_STATUSES.CANCELLED });

    eventBus.emit(createEvent({
      eventType: 'record.cancelled',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId },
    }));

    return updated;
  }

  async function archiveRecord(workspaceId, recordId, actor) {
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) throw new AppError('not_found', 'Record not found');

    const updated = await recordRepo.update(workspaceId, recordId, { status: RECORD_STATUSES.ARCHIVED });

    eventBus.emit(createEvent({
      eventType: 'record.archived',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId },
    }));

    return updated;
  }

  async function listRecords(workspaceId, filters = {}) {
    return recordRepo.query(workspaceId, filters);
  }

  async function listRecordsByEntity(workspaceId, entityId) {
    return recordRepo.listByEntityRef(workspaceId, entityId);
  }

  return {
    createRecord: createNewRecord,
    getRecord,
    updateDraftRecord,
    cancelRecord,
    archiveRecord,
    listRecords,
    listRecordsByEntity,
  };
}
