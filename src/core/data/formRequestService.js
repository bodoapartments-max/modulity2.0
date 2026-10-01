/**
 * Modulity 2.0 — Form Request Service
 *
 * Handles Form Request creation, lifecycle, and atomic completion.
 *
 * A Form Request asks another person to create a NEW Record using a specific Module.
 * This is DISTINCT from Record Delivery (sharing an existing Record).
 *
 * CRITICAL INVARIANTS:
 *   1. The request locks the exact Module Version at creation time (immutable).
 *   2. Completion uses the EXACT locked Module Version snapshot for validation
 *      and Record provenance — never the current Module document.
 *   3. Completion is ATOMIC: Record creation + request status update happen in
 *      a single Firestore transaction (via completeRequestAtomic repo method).
 *   4. Completion is IDEMPOTENT: a deterministic Record ID derived from requestId
 *      prevents duplicate Records. Retries resolve the existing result.
 *   5. sourceRequestId on the resulting Record links back to the FormRequest.
 *
 * @module core/data/formRequestService
 */

import { createFormRequest, FORM_REQUEST_STATUSES, validateFormRequestTransition } from './formRequest.js';
import { createRecord } from './record.js';
import { validateFormValues, extractEntityReferences } from '../../modules/forms/formSchemaValidator.js';
import { generateId } from '../utils/generateId.js';
import { deriveEntityReferenceIds } from './recordService.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * Deterministic Record ID for a Form Request completion.
 * Ensures at most one Record can be created per requestId.
 *
 * @param {string} requestId
 * @returns {string}
 */
export function deriveCompletionRecordId(requestId) {
  return `req_${requestId}`;
}

/**
 * @param {Object} deps
 * @param {Object} deps.formRequestRepo — must implement completeRequestAtomic(workspaceId, requestId, recordData, requestUpdates)
 * @param {Object} deps.moduleRepo — must implement getVersionSnapshot(workspaceId, moduleId, version)
 * @param {Object} deps.membershipRepo — for org workspace recipient validation (optional)
 * @param {Object} deps.workspaceRepo — for workspace type resolution (optional)
 */
export function createFormRequestService({ formRequestRepo, moduleRepo, membershipRepo = null, workspaceRepo = null }) {
  /**
   * Validates that a recipient is an active member of the workspace.
   * For PERSONAL workspaces: only the owner.
   * For ORGANIZATION workspaces: must be an active member.
   */
  async function validateRecipientMembership(workspaceId, recipientUserId) {
    if (!workspaceRepo || !membershipRepo) return; // Skip if repos not available

    const ws = await workspaceRepo.getById(workspaceId);
    if (!ws) {
      throw new AppError('not_found', 'Workspace not found');
    }

    if (ws.type === 'PERSONAL') {
      if (ws.ownerUserId !== recipientUserId) {
        throw new AppError('forbidden', 'Recipient must be the workspace owner for personal workspaces');
      }
    } else if (ws.type === 'ORGANIZATION') {
      const member = await membershipRepo.getByOrgAndUser(ws.organizationId, recipientUserId);
      if (!member || member.status !== 'ACTIVE') {
        throw new AppError('forbidden', 'Recipient must be an active member of the organization');
      }
    }
  }

  /**
   * Creates a Form Request.
   * Locks the current Module Version at creation time.
   * Validates recipient membership.
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

    // Validate recipient is an active member
    await validateRecipientMembership(workspaceId, recipientUserId);

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
   * ATOMIC + IDEMPOTENT:
   *   - Uses a Firestore transaction (via formRequestRepo.completeRequestAtomic)
   *     to atomically create the Record AND mark the request COMPLETED.
   *   - Uses a deterministic Record ID (req_{requestId}) so retries are safe.
   *   - If the request is already COMPLETED, returns the existing result.
   *
   * EXACT MODULE VERSION:
   *   - Loads the immutable Module Version SNAPSHOT (not the current Module).
   *   - Validates values against the historical Form Schema from that version.
   *   - Uses recordType from the version snapshot's recordConfig.
   *
   * RECIPIENT AUTHORIZATION:
   *   - Only the designated recipient can complete.
   *   - actor.actorId must match request.recipientUserId.
   *
   * @param {string} workspaceId
   * @param {string} requestId
   * @param {Object} values — form field values
   * @param {Object} actor — the person completing the request (must be recipient)
   * @returns {Promise<{ request: Object, record: Object }>}
   */
  async function completeRequest(workspaceId, requestId, values, actor) {
    const existing = await formRequestRepo.getById(workspaceId, requestId);
    if (!existing) {
      throw new AppError('not_found', 'Form request not found');
    }

    // Idempotency: if already completed, return existing result
    if (existing.status === FORM_REQUEST_STATUSES.COMPLETED) {
      if (existing.resultRecordId) {
        return { request: existing, record: { recordId: existing.resultRecordId } };
      }
      throw new AppError('conflict', 'Form request is already completed but resultRecordId is missing');
    }

    // Only recipient can complete
    if (actor.actorId !== existing.recipientUserId) {
      throw new AppError('forbidden', 'Only the recipient can complete a form request');
    }

    // Validate transition from current status
    const transition = validateFormRequestTransition(existing.status, FORM_REQUEST_STATUSES.COMPLETED);
    if (!transition.valid) {
      throw new AppError('forbidden', transition.error);
    }

    // Load the EXACT Module Version snapshot (immutable historical data)
    const versionSnapshot = await moduleRepo.getVersionSnapshot(
      workspaceId, existing.moduleId, existing.moduleVersion,
    );
    if (!versionSnapshot) {
      throw new AppError('not_found',
        `Module version snapshot not found: ${existing.moduleId} v${existing.moduleVersion}`);
    }

    // Validate values against the EXACT historical Form Schema
    const fields = versionSnapshot.formSchema?.fields || [];
    if (fields.length > 0) {
      const validation = validateFormValues(values, fields);
      if (!validation.valid) {
        throw new AppError('validation_error', 'Form validation failed against locked Module Version', validation.errors);
      }
    }

    // Extract entity references from values using historical schema
    const entityRefs = extractEntityReferences(values, fields);
    const entityReferenceIds = deriveEntityReferenceIds(entityRefs);

    // Derive deterministic Record ID for idempotency
    const recordId = deriveCompletionRecordId(requestId);

    // Derive recordType from the version snapshot (not current Module)
    const recordType = versionSnapshot.recordConfig?.recordType
      || versionSnapshot.moduleCode
      || existing.moduleId;

    const now = new Date().toISOString();

    // Build the canonical Record data
    const recordData = createRecord({
      recordId,
      workspaceId,
      moduleId: existing.moduleId,
      moduleVersion: existing.moduleVersion,
      recordType,
      status: 'SUBMITTED',
      createdBy: actor,
      submittedBy: actor,
      data: values,
      entityReferences: entityRefs,
      entityReferenceIds,
      sourceRequestId: requestId,
      submittedAt: now,
    });

    // Request status update payload
    const requestUpdates = {
      status: FORM_REQUEST_STATUSES.COMPLETED,
      resultRecordId: recordId,
      updatedAt: now,
    };

    // ATOMIC COMPLETION: transaction writes both Record and Request update
    const result = await formRequestRepo.completeRequestAtomic(
      workspaceId, requestId, recordData, requestUpdates,
    );

    eventBus.emit(createEvent({
      eventType: 'formRequest.completed',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        requestId,
        recordId,
        moduleId: existing.moduleId,
        moduleVersion: existing.moduleVersion,
        sourceRequestId: requestId,
      },
    }));

    return { request: result.request, record: result.record };
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
