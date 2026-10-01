/**
 * Modulity 2.0 — Record Delivery
 *
 * A Delivery shares an existing canonical Record with a recipient.
 * Delivery is NOT a Record copy. The canonical Record remains at:
 *   workspaces/{workspaceId}/records/{recordId}
 *
 * Path: workspaces/{workspaceId}/deliveries/{deliveryId}
 *
 * @module core/data/delivery
 */

export const DELIVERY_TYPES = Object.freeze({
  SHARE: 'SHARE',
  ASSIGNMENT: 'ASSIGNMENT',
});

export const DELIVERY_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
  OPENED: 'OPENED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  COMPLETED: 'COMPLETED',
  REVOKED: 'REVOKED',
});

/**
 * Valid status transitions for delivery lifecycle.
 */
export const DELIVERY_TRANSITIONS = Object.freeze({
  PENDING: ['DELIVERED', 'REVOKED'],
  DELIVERED: ['OPENED', 'REVOKED'],
  OPENED: ['ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'REVOKED'],
  ACKNOWLEDGED: ['ACCEPTED', 'DECLINED', 'COMPLETED', 'REVOKED'],
  ACCEPTED: ['COMPLETED', 'REVOKED'],
  DECLINED: [],
  COMPLETED: [],
  REVOKED: [],
});

/**
 * @typedef {Object} Delivery
 * @property {string} deliveryId
 * @property {string} workspaceId
 * @property {string} recordId — the canonical Record being shared
 * @property {string} deliveryType — SHARE or ASSIGNMENT
 * @property {Object} sender — ActorRef
 * @property {string} recipientUserId — target user
 * @property {string} status — one of DELIVERY_STATUSES
 * @property {string|null} message — optional context/note
 * @property {string|null} shareTokenId — optional link to secure share token
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates a Delivery value object.
 *
 * @param {Object} params
 * @returns {Delivery}
 */
export function createDelivery({
  deliveryId,
  workspaceId,
  recordId,
  deliveryType = DELIVERY_TYPES.SHARE,
  sender,
  recipientUserId,
  status = DELIVERY_STATUSES.PENDING,
  message = null,
  shareTokenId = null,
  createdAt,
  updatedAt,
}) {
  if (!deliveryId) throw new Error('deliveryId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!recordId) throw new Error('recordId is required');
  if (!DELIVERY_TYPES[deliveryType]) {
    throw new Error(`Invalid delivery type: ${deliveryType}`);
  }
  if (!sender) throw new Error('sender is required');
  if (!recipientUserId) throw new Error('recipientUserId is required');
  if (!DELIVERY_STATUSES[status]) {
    throw new Error(`Invalid delivery status: ${status}`);
  }

  return Object.freeze({
    deliveryId,
    workspaceId,
    recordId,
    deliveryType,
    sender: Object.freeze({ ...sender }),
    recipientUserId,
    status,
    message,
    shareTokenId,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Validates a delivery lifecycle transition.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDeliveryTransition(currentStatus, newStatus) {
  if (!DELIVERY_STATUSES[currentStatus]) {
    return { valid: false, error: `Invalid current status: ${currentStatus}` };
  }
  if (!DELIVERY_STATUSES[newStatus]) {
    return { valid: false, error: `Invalid target status: ${newStatus}` };
  }
  const allowed = DELIVERY_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return { valid: false, error: `Cannot transition from ${currentStatus} to ${newStatus}` };
  }
  return { valid: true, error: null };
}
