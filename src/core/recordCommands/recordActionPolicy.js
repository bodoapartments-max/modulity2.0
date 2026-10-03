/**
 * Modulity 2.0 — Record Action Policy (pure)
 *
 * Deterministic policy gate for generic Record actions. Given the verified
 * actor context, the canonical Record, and the Module, it decides allowed /
 * denied with a stable machine-readable reason code.
 *
 * Boundary:
 *  - The trusted server evaluates this policy authoritatively.
 *  - UI uses the same pure function only to decide which actions to SHOW.
 *    UI visibility is never authorization.
 *
 * No Firebase imports here. State loading happens outside.
 *
 * @module core/recordCommands/recordActionPolicy
 */

import { RECORD_STATUSES } from '../data/record.js';
import { RECORD_COMMAND_TYPES, RECORD_COMMAND_ERROR_CODES } from './recordCommandContract.js';
import { evaluateRecordTransition } from './recordLifecycle.js';

/**
 * UI-facing action ids include EDIT_DRAFT (navigation) in addition to the
 * command types; the server only executes real command types.
 */
export const RECORD_ACTIONS = Object.freeze({
  EDIT_DRAFT: 'EDIT_DRAFT',
  UPDATE_DRAFT: RECORD_COMMAND_TYPES.UPDATE_DRAFT,
  SUBMIT_RECORD: RECORD_COMMAND_TYPES.SUBMIT_RECORD,
  SET_PRIORITY: RECORD_COMMAND_TYPES.SET_PRIORITY,
  ARCHIVE_RECORD: RECORD_COMMAND_TYPES.ARCHIVE_RECORD,
  RESTORE_RECORD: RECORD_COMMAND_TYPES.RESTORE_RECORD,
  CANCEL_RECORD: RECORD_COMMAND_TYPES.CANCEL_RECORD,
});

/**
 * @typedef {Object} RecordActorContext
 * @property {boolean} authenticated
 * @property {'PERSONAL_OWNER'|'ORGANIZATION_MEMBER'|null} workspaceAccess — verified authority
 */

/**
 * Evaluates whether an action is allowed for a Record.
 *
 * @param {Object} params
 * @param {RecordActorContext} params.actorContext
 * @param {Object|null} params.record
 * @param {Object|null} [params.module] — required for SUBMIT_RECORD / UPDATE_DRAFT module checks
 * @param {string} params.action — RECORD_ACTIONS value
 * @returns {{ allowed: boolean, reasonCode: null|string }}
 */
export function evaluateRecordAction({ actorContext, record, module = null, action }) {
  if (!actorContext?.authenticated) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.UNAUTHENTICATED };
  }
  if (!actorContext.workspaceAccess) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN };
  }
  if (!record) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.RECORD_NOT_FOUND };
  }

  if (action === RECORD_ACTIONS.EDIT_DRAFT) {
    return record.status === RECORD_STATUSES.DRAFT
      ? { allowed: true, reasonCode: null }
      : { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE };
  }

  if (!RECORD_TRANSITION_REQUIRED[action]) {
    return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }

  if (action === RECORD_ACTIONS.SUBMIT_RECORD || action === RECORD_ACTIONS.UPDATE_DRAFT) {
    // Draft content operations require a resolvable, ACTIVE source Module.
    if (!module) {
      return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND };
    }
    if (module.status !== 'ACTIVE') {
      return { allowed: false, reasonCode: RECORD_COMMAND_ERROR_CODES.MODULE_NOT_ACTIVE };
    }
  }

  const transitionCheck = evaluateRecordTransition(record, action);
  if (!transitionCheck.allowed) {
    return { allowed: false, reasonCode: transitionCheck.reasonCode };
  }

  if (action === RECORD_ACTIONS.SET_PRIORITY) {
    return { allowed: true, reasonCode: null };
  }

  return { allowed: true, reasonCode: null };
}

const RECORD_TRANSITION_REQUIRED = Object.freeze({
  [RECORD_ACTIONS.UPDATE_DRAFT]: true,
  [RECORD_ACTIONS.SUBMIT_RECORD]: true,
  [RECORD_ACTIONS.SET_PRIORITY]: true,
  [RECORD_ACTIONS.ARCHIVE_RECORD]: true,
  [RECORD_ACTIONS.RESTORE_RECORD]: true,
  [RECORD_ACTIONS.CANCEL_RECORD]: true,
});
