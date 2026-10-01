/**
 * Modulity 2.0 — Form Request Service
 *
 * Handles Form Request creation, lifecycle, and atomic completion.
 *
 * A Form Request asks another person to create a NEW Record using a specific Module.
 * This is DISTINCT from Record Delivery (sharing an existing Record).
 *
 * CRITICAL INVARIANT: The request locks the exact Module Version that was active
 * when the request was created. moduleId and moduleVersion are immutable on
 * the request — the requester cannot silently reinterpret the request.
 *
 * @module core/data/formRequestService
 */

import { createFormRequest, FORM_REQUEST_STATUSES, validateFormRequestTransition } from './formRequest.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.formRequestRepo
 * @param {Object} deps.moduleRepo — for loading Module to capture current version
 * @param {Object} deps.recordService — for creating the result Record on completion
 */
export function createFormRequestService({ formRequestRepo, moduleRepo, recordService }) {
  /**
   * Creates a Form Request.
   * Locks the current Module Version at creation time.
   */
  async function createNewFormRequest({
    workspaceId,
    moduleId,
    recipientUserId,
    requester,
    message = null,
    priority = null,
    dueDate = null,
  }) {
    // Load the Module to capture its current version
    const mod = await moduleRepo.getById(workspaceId, moduleId);
    if (!mod) {
      throw new AppError('not_found', `Module not found: ${moduleId}`);
    }
    if (mod.status !== 'ACTIVE') {
      throw new AppError('forbidden', 'Form requests can only be created for active modules');
    }

    const request = createFormRequest({
      requestId: generateId(),
      workspaceId,
      moduleId,
      moduleVersion: mod.version,
      requester,
      recipientUserId,
      message,
      priority,
      dueDate,
    });

    const created = await formRequestRepo.create(request);

    eventBus.emit(createEvent({
      eventType: 'formRequest.created',
      workspaceId,
      actor: { type: requester.actorType === 'USER' ? 'user' : 'service', id: requester.actorId },
      payload: {
        requestId: created.requestId,
        moduleId,
        moduleVersion: mod.version,
        recipientUserId,
      },
    }));

    return created;
  }

  /**
   * Updates request status with lifecycle validation.
   */
  async function updateRequestStatus(workspaceId, requestId, newStatus, actor) {
    const existing = await formRequestRepo.getById(workspaceId, requestId);
    if (!existing) {
      throw new AppError('not_found', 'Form request not found');
    }

    const transition = validateFormRequestTransition(existing.status, newStatus);
    if (!transition.valid) {
      throw new AppError('forbidden', transition.error);
    }

    // Only requester can cancel; only recipient can open/decline/progress
    if (newStatus === FORM_REQUEST_STATUSES.CANCELLED) {
      if (actor.actorId !== existing.requester.actorId) {
        throw new AppError('forbidden', 'Only the requester can cancel a form request');
      }
    } else if ([FORM_REQUEST_STATUSES.OPENED, FORM_REQUEST_STATUSES.IN_PROGRESS, FORM_REQUEST_STATUSES.DECLINED].includes(newStatus)) {
      if (actor.actorId !== existing.recipientUserId) {
        throw new AppError('forbidden', 'Only the recipient can update this form request status');
      }
    }

    const updated = await formRequestRepo.update(workspaceId, requestId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'formRequest.status_changed',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { requestId, oldStatus: existing.status, newStatus },
    }));

    return updated;
  }

  /**
   * Completes a Form Request by creating the resulting Record.
   *
   * ATOMICITY: Creates the Record and marks the request as COMPLETED.
   * Uses the LOCKED Module Version from the request, not the current Module.
   * Prevents duplicate completion.
   *
   * @param {string} workspaceId
   * @param {string} requestId
   * @param {Object} values — form field values
   * @param {Object} actor — the person completing the request (should be recipient)
   * @returns {Promise<{ request: Object, record: Object }>}
   */
  async function completeRequest(workspaceId, requestId, values, actor) {
    const existing = await formRequestRepo.getById(workspaceId, requestId);
    if (!existing) {
      throw new AppError('not_found', 'Form request not found');
    }

    // Prevent duplicate completion
    if (existing.status === FORM_REQUEST_STATUSES.COMPLETED) {
      throw new AppError('forbidden', 'Form request is already completed');
    }

    // Only recipient can complete
    if (actor.actorId !== existing.recipientUserId) {
      throw new AppError('forbidden', 'Only the recipient can complete a form request');
    }

    // Validate transition
    const transition = validateFormRequestTransition(existing.status, FORM_REQUEST_STATUSES.COMPLETED);
    if (!transition.valid) {
      throw new AppError('forbidden', transition.error);
    }

    // Load the LOCKED Module Version for validation context
    const mod = await moduleRepo.getById(workspaceId, existing.moduleId);
    if (!mod) {
      throw new AppError('not_found', 'Module no longer exists');
    }

    // Create the Record using the LOCKED Module Version
    const record = await recordService.createRecord({
      workspaceId,
      moduleId: existing.moduleId,
      moduleVersion: existing.moduleVersion,
      recordType: mod.recordConfig?.recordType || mod.moduleCode,
      status: 'SUBMITTED',
      createdBy: actor,
      submittedBy: actor,
      data: values,
      submittedAt: new Date().toISOString(),
    });

    // Mark request as completed with the result Record ID
    const updatedRequest = await formRequestRepo.update(workspaceId, requestId, {
      status: FORM_REQUEST_STATUSES.COMPLETED,
      resultRecordId: record.recordId,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'formRequest.completed',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        requestId,
        recordId: record.recordId,
        moduleId: existing.moduleId,
        moduleVersion: existing.moduleVersion,
      },
    }));

    return { request: updatedRequest, record };
  }

  async function getRequest(workspaceId, requestId) {
    return formRequestRepo.getById(workspaceId, requestId);
  }

  async function listSentRequests(workspaceId, userId) {
    return formRequestRepo.listByRequester(workspaceId, userId);
  }

  async function listReceivedRequests(workspaceId, userId) {
    return formRequestRepo.listByRecipient(workspaceId, userId);
  }

  return {
    createFormRequest: createNewFormRequest,
    updateRequestStatus,
    completeRequest,
    getRequest,
    listSentRequests,
    listReceivedRequests,
  };
}
