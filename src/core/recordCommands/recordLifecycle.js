/**
 * Modulity 2.0 — Record Lifecycle Transition Model (pure)
 *
 * Deterministic answer to: "can a Record in status X execute command Y, and
 * what is the resulting canonical state?"
 *
 * The client NEVER picks a target status. The command implies the
 * transition; this module is the single authoritative transition table used
 * by the trusted server engine and by UI action-discovery hints.
 *
 * This is NOT a Workflow engine. Approval/Workflow compose on top of this
 * substrate later; they do not live here.
 *
 * @module core/recordCommands/recordLifecycle
 */

import { RECORD_STATUSES } from '../data/record.js';
import { RECORD_COMMAND_TYPES, RECORD_COMMAND_ERROR_CODES } from './recordCommandContract.js';

/**
 * Transition table: which source statuses each command accepts and what
 * status (if any) it produces. `null` nextStatus = status unchanged.
 */
export const RECORD_TRANSITIONS = Object.freeze({
  [RECORD_COMMAND_TYPES.UPDATE_DRAFT]: Object.freeze({
    from: Object.freeze([RECORD_STATUSES.DRAFT]),
    nextStatus: null,
  }),
  [RECORD_COMMAND_TYPES.SUBMIT_RECORD]: Object.freeze({
    from: Object.freeze([RECORD_STATUSES.DRAFT]),
    nextStatus: RECORD_STATUSES.SUBMITTED,
  }),
  [RECORD_COMMAND_TYPES.SET_PRIORITY]: Object.freeze({
    from: Object.freeze([
      RECORD_STATUSES.DRAFT,
      RECORD_STATUSES.SUBMITTED,
      RECORD_STATUSES.ACTIVE,
      RECORD_STATUSES.COMPLETED,
    ]),
    nextStatus: null,
  }),
  [RECORD_COMMAND_TYPES.ARCHIVE_RECORD]: Object.freeze({
    from: Object.freeze(Object.values(RECORD_STATUSES)),
    nextStatus: RECORD_STATUSES.ARCHIVED,
    idempotent: true, // archiving an already-archived Record is a no-op success
  }),
  [RECORD_COMMAND_TYPES.RESTORE_RECORD]: Object.freeze({
    from: Object.freeze([RECORD_STATUSES.ARCHIVED]),
    // nextStatus resolved at runtime from record._previousStatus
    nextStatus: null,
  }),
  [RECORD_COMMAND_TYPES.CANCEL_RECORD]: Object.freeze({
    from: Object.freeze([
      RECORD_STATUSES.DRAFT,
      RECORD_STATUSES.SUBMITTED,
      RECORD_STATUSES.ACTIVE,
      RECORD_STATUSES.COMPLETED,
    ]),
    nextStatus: RECORD_STATUSES.CANCELLED,
  }),
});

/**
 * Validates that `commandType` may run against `record` in its current state.
 *
 * @param {Object} record — canonical Record (must have status)
 * @param {string} commandType
 * @returns {{ allowed: boolean, reasonCode: null|string, transition: Object|null, nextStatus: string|null }}
 */
export function evaluateRecordTransition(record, commandType) {
  const transition = RECORD_TRANSITIONS[commandType] || null;
  if (!transition) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND, transition: null, nextStatus: null };
  }
  if (!record) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.RECORD_NOT_FOUND, transition, nextStatus: null };
  }
  if (transition.idempotent && transition.nextStatus && record.status === transition.nextStatus) {
    // Idempotent command replayed against the already-targeted state.
    return { allowed: true, reasonCode: null, transition, nextStatus: record.status };
  }
  if (!transition.from.includes(record.status)) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE, transition, nextStatus: null };
  }
  const nextStatus = commandType === RECORD_COMMAND_TYPES.RESTORE_RECORD
    ? (record._previousStatus && RECORD_STATUSES[record._previousStatus] ? record._previousStatus : RECORD_STATUSES.ACTIVE)
    : transition.nextStatus;
  return { allowed: true, reasonCode: null, transition, nextStatus };
}
