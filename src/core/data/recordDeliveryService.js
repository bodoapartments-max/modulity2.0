/**
 * Modulity 2.0 — Record Delivery Service
 *
 * Handles sharing/sending existing Records to other users.
 * Delivery is NOT Record duplication.
 *
 * Distinct from:
 *   - FormRequestService (asks someone to CREATE a new Record)
 *   - Assignment (assigns responsibility for work on a Record)
 *
 * RECIPIENT VALIDATION:
 *   - For Organization Workspaces, the recipient must be an ACTIVE member.
 *   - Suspended, LEFT, or non-member recipients are rejected.
 *   - For Personal Workspaces, the recipient must be the owner.
 *
 * @module core/data/recordDeliveryService
 */

import { createDelivery, DELIVERY_STATUSES, DELIVERY_TYPES, validateDeliveryTransition } from './delivery.js';
import { generateId } from '../utils/generateId.js';
import { eventBus, createEvent } from '../events/eventBus.js';
import { AppError } from '../errors/appError.js';

/**
 * @param {Object} deps
 * @param {Object} deps.deliveryRepo
 * @param {Object} deps.recordRepo
 * @param {Object} [deps.membershipRepo] — for org workspace recipient validation
 * @param {Object} [deps.workspaceRepo] — for workspace type resolution
 */
export function createRecordDeliveryService({ deliveryRepo, recordRepo, membershipRepo = null, workspaceRepo = null }) {
  /**
   * Validates that a recipient is an active member of the workspace.
   */
  async function validateRecipientMembership(workspaceId, recipientUserId) {
    if (!workspaceRepo || !membershipRepo) return;

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
   * Sends/shares a Record with a recipient.
   * Validates recipient membership before creating the delivery.
   */
  async function sendRecord({
    workspaceId,
    recordId,
    recipientUserId,
    sender,
    deliveryType = DELIVERY_TYPES.SHARE,
    message = null,
    shareTokenId = null,
  }) {
    // Verify record exists
    const record = await recordRepo.getById(workspaceId, recordId);
    if (!record) {
      throw new AppError('not_found', 'Record not found');
    }

    // Cannot send to yourself
    if (sender.actorId === recipientUserId) {
      throw new AppError('validation_error', 'Cannot send a record to yourself');
    }

    // Validate recipient is an active member
    await validateRecipientMembership(workspaceId, recipientUserId);

    const delivery = createDelivery({
      deliveryId: generateId(),
      workspaceId,
      recordId,
      deliveryType,
      sender,
      recipientUserId,
      status: DELIVERY_STATUSES.PENDING,
      message,
      shareTokenId,
    });

    const created = await deliveryRepo.create(delivery);

    eventBus.emit(createEvent({
      eventType: 'record.sent',
      workspaceId,
      actor: { type: sender.actorType === 'USER' ? 'user' : 'service', id: sender.actorId },
      payload: {
        deliveryId: created.deliveryId,
        recordId,
        recipientUserId,
        deliveryType,
      },
    }));

    return created;
  }

  /**
   * Updates delivery lifecycle status.
   */
  async function updateDeliveryStatus(workspaceId, deliveryId, newStatus, actor) {
    const existing = await deliveryRepo.getById(workspaceId, deliveryId);
    if (!existing) {
      throw new AppError('not_found', 'Delivery not found');
    }

    const transition = validateDeliveryTransition(existing.status, newStatus);
    if (!transition.valid) {
      throw new AppError('forbidden', transition.error);
    }

    // Only sender can revoke; only recipient can acknowledge/accept/decline
    if (newStatus === DELIVERY_STATUSES.REVOKED) {
      if (actor.actorId !== existing.sender.actorId) {
        throw new AppError('forbidden', 'Only the sender can revoke a delivery');
      }
    } else if ([DELIVERY_STATUSES.OPENED, DELIVERY_STATUSES.ACKNOWLEDGED, DELIVERY_STATUSES.ACCEPTED, DELIVERY_STATUSES.DECLINED].includes(newStatus)) {
      if (actor.actorId !== existing.recipientUserId) {
        throw new AppError('forbidden', 'Only the recipient can update this delivery status');
      }
    }

    const updated = await deliveryRepo.update(workspaceId, deliveryId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emit(createEvent({
      eventType: 'delivery.status_changed',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        deliveryId,
        recordId: existing.recordId,
        oldStatus: existing.status,
        newStatus,
      },
    }));

    return updated;
  }

  /**
   * Gets a delivery by ID.
   */
  async function getDelivery(workspaceId, deliveryId) {
    return deliveryRepo.getById(workspaceId, deliveryId);
  }

  /**
   * Lists deliveries sent by a user.
   */
  async function listSent(workspaceId, userId) {
    return deliveryRepo.listBySender(workspaceId, userId);
  }

  /**
   * Lists deliveries received by a user.
   */
  async function listReceived(workspaceId, userId) {
    return deliveryRepo.listByRecipient(workspaceId, userId);
  }

  /**
   * Lists all deliveries for a specific record.
   */
  async function listForRecord(workspaceId, recordId) {
    return deliveryRepo.listByRecord(workspaceId, recordId);
  }

  return {
    sendRecord,
    updateDeliveryStatus,
    getDelivery,
    listSent,
    listReceived,
    listForRecord,
  };
}
