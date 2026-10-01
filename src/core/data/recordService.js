/**
 * Modulity 2.0 — Record Application Service (Foundation)
 *
 * For Step 3: create, get, update draft, archive/cancel, validate entity references.
 * Full Module-driven Record creation comes in later steps.
 *
 * @module core/data/recordService
 */

import { createRecord, RECORD_STATUSES } from './record.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./recordRepository.js').RecordRepository} deps.recordRepo
 * @param {import('./entityRepository.js').EntityRepository} deps.entityRepo
 */
export function createRecordService({ recordRepo, entityRepo }) {
  /**
   * Validates that all entity references belong to the record's workspace.
   */
  async function validateEntityReferences(workspaceId, entityReferences) {
    for (const ref of entityReferences) {
      if (ref.workspaceId !== workspaceId) {
        throw new AppError('forbidden', `Cross-workspace entity reference denied: ${ref.entityId}`);
      }
      const entity = await entityRepo.getById(ref.workspaceId, ref.entityId);
      if (!entity) {
        throw new AppError('not_found', `Referenced entity not found: ${ref.entityId}`);
      }
    }
  }

  async function createNewRecord({
    workspaceId,
    recordType,
    moduleId = null,
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

    const record = createRecord({
      recordId: generateId(),
      workspaceId,
      moduleId,
      recordType,
      status,
      priority,
      createdBy,
      submittedBy,
      data,
      entityReferences,
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
