/**
 * Modulity 2.0 — Record Operation Service
 *
 * Handles Record-level operations: priority changes, archive, bulk ops.
 * Enforces submitted Record immutability policy.
 *
 * SEPARATE from RecordService (CRUD) and RecordQueryService (queries).
 *
 * Submitted Record mutability policy:
 *   - Module provenance (moduleId, moduleVersion, recordType) is ALWAYS immutable.
 *   - DRAFT records: data freely editable via RecordService.updateDraftRecord.
 *   - SUBMITTED/ACTIVE records: only status, priority, and operational metadata
 *     can be changed. Business data (record.data) is frozen after submission.
 *   - COMPLETED/CANCELLED/ARCHIVED: only status transitions allowed.
 *
 * @module core/data/recordOperationService
 */

import { RECORD_STATUSES, RECORD_PRIORITIES } from './record.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.recordRepo
 */
export function createRecordOperationService({ recordRepo }) {
  /**
   * Changes Record priority.
   * Allowed on any non-terminal status.
   */
  async function setPriority(workspaceId, recordId, priority, actor) {
    if (priority !== null && !RECORD_PRIORITIES[priority]) {
      throw new AppError('validation_error', `Invalid priority: ${priority}`);
    }
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) {
      throw new AppError('not_found', 'Record not found');
    }
    if (existing.status === RECORD_STATUSES.CANCELLED || existing.status === RECORD_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Cannot change priority of cancelled or archived records');
    }

    const updated = await recordRepo.update(workspaceId, recordId, { priority });

    eventBus.emit(createEvent({
      eventType: 'record.priority_changed',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId, oldPriority: existing.priority, newPriority: priority },
    }));

    return updated;
  }

  /**
   * Archives a Record. Preserves the Record and its historical provenance.
   * Any non-archived Record can be archived. Archive is reversible via unarchive.
   */
  async function archiveRecord(workspaceId, recordId, actor) {
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) {
      throw new AppError('not_found', 'Record not found');
    }
    if (existing.status === RECORD_STATUSES.ARCHIVED) {
      return existing; // Idempotent
    }

    const updated = await recordRepo.update(workspaceId, recordId, {
      status: RECORD_STATUSES.ARCHIVED,
      _previousStatus: existing.status,
    });

    eventBus.emit(createEvent({
      eventType: 'record.archived',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId, previousStatus: existing.status },
    }));

    return updated;
  }

  /**
   * Unarchives a Record. Restores to previous status if available.
   */
  async function unarchiveRecord(workspaceId, recordId, actor) {
    const existing = await recordRepo.getById(workspaceId, recordId);
    if (!existing) {
      throw new AppError('not_found', 'Record not found');
    }
    if (existing.status !== RECORD_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Record is not archived');
    }

    const restoredStatus = existing._previousStatus || RECORD_STATUSES.ACTIVE;
    const updated = await recordRepo.update(workspaceId, recordId, {
      status: restoredStatus,
      _previousStatus: null,
    });

    eventBus.emit(createEvent({
      eventType: 'record.unarchived',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId, restoredStatus },
    }));

    return updated;
  }

  /**
   * Bulk operation: applies an operation to multiple records.
   *
   * Validates authorization for each affected record.
   * Returns results per record (partial failure possible).
   *
   * @param {string} workspaceId
   * @param {string[]} recordIds
   * @param {string} operation — 'archive' | 'unarchive' | 'setPriority'
   * @param {Object} params — operation-specific params (e.g. { priority: 'HIGH' })
   * @param {Object} actor — ActorRef
   * @returns {Promise<{ succeeded: string[], failed: Array<{recordId: string, error: string}> }>}
   */
  async function bulkOperation(workspaceId, recordIds, operation, params, actor) {
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      throw new AppError('validation_error', 'recordIds must be a non-empty array');
    }
    if (recordIds.length > 50) {
      throw new AppError('validation_error', 'Bulk operations limited to 50 records');
    }

    const succeeded = [];
    const failed = [];

    for (const recordId of recordIds) {
      try {
        switch (operation) {
          case 'archive':
            await archiveRecord(workspaceId, recordId, actor);
            break;
          case 'unarchive':
            await unarchiveRecord(workspaceId, recordId, actor);
            break;
          case 'setPriority':
            await setPriority(workspaceId, recordId, params?.priority ?? null, actor);
            break;
          default:
            throw new AppError('validation_error', `Unknown bulk operation: ${operation}`);
        }
        succeeded.push(recordId);
      } catch (err) {
        failed.push({ recordId, error: err.message });
      }
    }

    eventBus.emit(createEvent({
      eventType: 'record.bulk_operation',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        operation,
        totalRequested: recordIds.length,
        succeeded: succeeded.length,
        failed: failed.length,
      },
    }));

    return { succeeded, failed };
  }

  return {
    setPriority,
    archiveRecord,
    unarchiveRecord,
    bulkOperation,
  };
}
