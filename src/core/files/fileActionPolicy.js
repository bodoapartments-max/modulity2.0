/**
 * Modulity 2.0 — File Action Policy (pure, Step 30)
 *
 * Deterministic policy gate for File operations. Given the verified actor
 * context, the canonical File / Attachment / target, it decides allowed /
 * denied with a stable machine-readable reason code.
 *
 * Boundary:
 *  - The trusted server evaluates this authoritatively.
 *  - UI uses it only to decide which actions to SHOW — never authorization.
 *
 * @module core/files/fileActionPolicy
 */

import { FILE_STATUSES } from './file.js';
import { ATTACHMENT_STATUSES, ATTACHMENT_TARGET_TYPES } from './fileAttachment.js';
import { FILE_COMMAND_TYPES, FILE_COMMAND_ERROR_CODES } from './fileCommandContract.js';

/**
 * @param {Object} params
 * @param {Object} params.actorContext — { authenticated, workspaceAccess }
 * @param {Object|null} params.file — required for file-scoped actions
 * @param {Object|null} [params.attachment] — required for DETACH_FILE
 * @param {Object|null} [params.target] — resolved target doc for ATTACH_FILE
 * @param {string} params.action — FILE_COMMAND_TYPES value
 * @returns {{ allowed: boolean, reasonCode: null|string }}
 */
export function evaluateFileAction({ actorContext, file = null, attachment = null, target = null, action }) {
  if (!actorContext?.authenticated) {
    return { allowed: false, reasonCode: FILE_COMMAND_ERROR_CODES.UNAUTHENTICATED };
  }
  if (!actorContext.workspaceAccess) {
    return { allowed: false, reasonCode: FILE_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN };
  }

  switch (action) {
    case FILE_COMMAND_TYPES.CREATE_FILE:
      return { allowed: true, reasonCode: null };

    case FILE_COMMAND_TYPES.CREATE_FILE_VERSION: {
      if (!file) return deny(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND);
      if (file.status !== FILE_STATUSES.ACTIVE) return deny(FILE_COMMAND_ERROR_CODES.INVALID_FILE_STATE);
      return { allowed: true, reasonCode: null };
    }

    case FILE_COMMAND_TYPES.ATTACH_FILE: {
      if (!file) return deny(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND);
      if (file.status !== FILE_STATUSES.ACTIVE) return deny(FILE_COMMAND_ERROR_CODES.INVALID_FILE_STATE);
      if (!target) return deny(FILE_COMMAND_ERROR_CODES.TARGET_NOT_FOUND);
      return { allowed: true, reasonCode: null };
    }

    case FILE_COMMAND_TYPES.DETACH_FILE: {
      if (!attachment) return deny(FILE_COMMAND_ERROR_CODES.ATTACHMENT_NOT_FOUND);
      if (attachment.status !== ATTACHMENT_STATUSES.ACTIVE) return deny(FILE_COMMAND_ERROR_CODES.INVALID_FILE_STATE);
      return { allowed: true, reasonCode: null };
    }

    case FILE_COMMAND_TYPES.ARCHIVE_FILE: {
      if (!file) return deny(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND);
      if (file.status !== FILE_STATUSES.ACTIVE) return deny(FILE_COMMAND_ERROR_CODES.INVALID_FILE_STATE);
      return { allowed: true, reasonCode: null };
    }

    case FILE_COMMAND_TYPES.RESTORE_FILE: {
      if (!file) return deny(FILE_COMMAND_ERROR_CODES.FILE_NOT_FOUND);
      if (file.status !== FILE_STATUSES.ARCHIVED) return deny(FILE_COMMAND_ERROR_CODES.INVALID_FILE_STATE);
      return { allowed: true, reasonCode: null };
    }

    default:
      return deny(FILE_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  }
}

function deny(reasonCode) {
  return { allowed: false, reasonCode };
}

/**
 * Resolves the target doc path for an attachment target type within a
 * workspace. Closed mapping — no arbitrary collection access.
 *
 * @param {string} targetType — ATTACHMENT_TARGET_TYPES
 * @param {string} workspaceId
 * @param {string} targetId
 * @returns {string|null} Firestore doc path or null for unknown types
 */
export function attachmentTargetDocPath(targetType, workspaceId, targetId) {
  switch (targetType) {
    case ATTACHMENT_TARGET_TYPES.RECORD:
      return `workspaces/${workspaceId}/records/${targetId}`;
    case ATTACHMENT_TARGET_TYPES.ENTITY:
      return `workspaces/${workspaceId}/entities/${targetId}`;
    default:
      return null;
  }
}
