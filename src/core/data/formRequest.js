/**
 * Modulity 2.0 — Form Request
 *
 * A Form Request asks another person to create a new Record using a specific Module.
 * This is NOT a delivery of an existing Record — it is a request for a NEW Record.
 *
 * CRITICAL INVARIANT: The request locks the exact Module Version that was active
 * when the request was created. The requester cannot silently reinterpret the
 * request by editing the Module later.
 *
 * Path: workspaces/{workspaceId}/formRequests/{requestId}
 *
 * @module core/data/formRequest
 */

export const FORM_REQUEST_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  OPENED: 'OPENED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
});

export const FORM_REQUEST_TRANSITIONS = Object.freeze({
  PENDING: ['OPENED', 'CANCELLED', 'EXPIRED'],
  OPENED: ['IN_PROGRESS', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  IN_PROGRESS: ['COMPLETED', 'DECLINED', 'CANCELLED'],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  EXPIRED: [],
});

/**
 * @typedef {Object} FormRequest
 * @property {string} requestId
 * @property {string} workspaceId
 * @property {string} moduleId — the Module defining the form
 * @property {number} moduleVersion — LOCKED version at request creation time (immutable)
 * @property {Object} requester — ActorRef who created the request
 * @property {string} recipientUserId — who should fill the form
 * @property {string} status — one of FORM_REQUEST_STATUSES
 * @property {string|null} message — optional instructions
 * @property {string|null} resultRecordId — the Record created when request is completed
 * @property {string|null} priority — optional priority hint
 * @property {string|null} dueDate — optional deadline
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Creates a FormRequest value object.
 *
 * @param {Object} params
 * @returns {FormRequest}
 */
export function createFormRequest({
  requestId,
  workspaceId,
  moduleId,
  moduleVersion,
  requester,
  recipientUserId,
  status = FORM_REQUEST_STATUSES.PENDING,
  message = null,
  resultRecordId = null,
  priority = null,
  dueDate = null,
  createdAt,
  updatedAt,
}) {
  if (!requestId) throw new Error('requestId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!moduleId) throw new Error('moduleId is required');
  if (typeof moduleVersion !== 'number' || !Number.isInteger(moduleVersion) || moduleVersion < 1) {
    throw new Error('moduleVersion must be a positive integer');
  }
  if (!requester) throw new Error('requester is required');
  if (!recipientUserId) throw new Error('recipientUserId is required');
  if (!FORM_REQUEST_STATUSES[status]) {
    throw new Error(`Invalid form request status: ${status}`);
  }

  return Object.freeze({
    requestId,
    workspaceId,
    moduleId,
    moduleVersion,
    requester: Object.freeze({ ...requester }),
    recipientUserId,
    status,
    message,
    resultRecordId,
    priority,
    dueDate,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

/**
 * Validates a form request lifecycle transition.
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateFormRequestTransition(currentStatus, newStatus) {
  if (!FORM_REQUEST_STATUSES[currentStatus]) {
    return { valid: false, error: `Invalid current status: ${currentStatus}` };
  }
  if (!FORM_REQUEST_STATUSES[newStatus]) {
    return { valid: false, error: `Invalid target status: ${newStatus}` };
  }
  const allowed = FORM_REQUEST_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return { valid: false, error: `Cannot transition from ${currentStatus} to ${newStatus}` };
  }
  return { valid: true, error: null };
}
