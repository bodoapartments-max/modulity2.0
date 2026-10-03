/**
 * Modulity 2.0 — Trusted Record Command Engine (pure/validation layer)
 *
 * Pure, transport-independent command validation and canonical Record
 * construction. Used by the Cloud Function executor and by client-side UX
 * validation (non-authoritative).
 *
 * @module core/recordCommands/recordCommandEngine
 */

import { validateRecordCommand, RECORD_COMMAND_TYPES, RECORD_COMMAND_ERROR_CODES } from './recordCommandContract.js';
import { validateFormValues, extractEntityReferences } from '../../modules/forms/formSchemaValidator.js';
import { createRecord, RECORD_STATUSES, RECORD_PRIORITIES } from '../data/record.js';
import { validateEntityReference } from '../data/entity.js';
import { userActor } from '../data/actorRef.js';
import { generateId } from '../utils/generateId.js';

function deriveEntityReferenceIds(refs) {
  return refs.map((r) => r.entityId);
}

/**
 * Validates the command and module-driven form values.
 *
 * @param {import('./recordCommandContract.js').RecordCommand} command
 * @param {import('../../modules/module.js').ModuleDefinition} module
 * @returns {{ valid: boolean, errors: string[], code?: string }}
 */
export function validateCreateRecordCommand(command, module) {
  const envelope = validateRecordCommand(command);
  if (!envelope.valid) return envelope;

  const errors = [];

  if (!module) {
    return { valid: false, errors: ['Module not found'], code: RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND };
  }

  const status = module.status;
  const allowedStatuses = ['ACTIVE'];
  if (!allowedStatuses.includes(status)) {
    errors.push(`Module status "${status}" does not allow record creation. Only ACTIVE Modules may receive canonical Records.`);
  }

  const fields = module.formSchema?.fields || [];
  if (fields.length === 0) {
    errors.push('Module has no form fields defined');
  }

  const payload = command.payload;
  const validation = validateFormValues(payload.values, fields);
  if (!validation.valid) {
    return { valid: false, errors: Object.values(validation.errors), code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }

  const entityRefs = extractEntityReferences(payload.values, fields);
  for (const ref of entityRefs) {
    const refResult = validateEntityReference(ref);
    if (!refResult.valid) {
      errors.push(`Invalid entity reference: ${refResult.errors.join(', ')}`);
    } else if (ref.workspaceId !== payload.workspaceId) {
      errors.push('Cross-workspace entity reference denied');
    }
  }

  if (errors.length) {
    return { valid: false, errors, code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }

  return { valid: true, errors: [], entityRefs };
}

/**
 * Builds a canonical Record value from a CREATE_RECORD command.
 *
 * Server-authoritative metadata (createdAt, updatedAt, createdBy, recordId)
 * must still be supplied/overridden by the trusted executor.
 *
 * @param {Object} params
 * @param {import('./recordCommandContract.js').RecordCommand} params.command
 * @param {import('../../modules/module.js').ModuleDefinition} params.module
 * @param {string} params.actorId — verified server-side user id
 * @param {string} params.recordId
 * @param {string} params.now — server-authoritative ISO timestamp
 * @returns {import('../data/record.js').Record}
 */
export function buildCanonicalRecordFromCommand({
  command,
  module,
  actorId,
  recordId = generateId(),
  now = new Date().toISOString(),
}) {
  if (command.commandType !== RECORD_COMMAND_TYPES.CREATE_RECORD) {
    throw new Error(`buildCanonicalRecordFromCommand only supports CREATE_RECORD, got ${command.commandType}`);
  }

  const payload = command.payload;
  const fields = module.formSchema?.fields || [];
  const entityRefs = extractEntityReferences(payload.values, fields);

  const actor = userActor(actorId);
  const isDraft = !!payload.isDraft;
  const status = isDraft ? RECORD_STATUSES.DRAFT : RECORD_STATUSES.SUBMITTED;

  return createRecord({
    recordId,
    workspaceId: payload.workspaceId,
    moduleId: module.moduleId,
    moduleVersion: module.version,
    recordType: module.recordConfig?.recordType || module.moduleCode,
    status,
    createdBy: actor,
    submittedBy: isDraft ? null : actor,
    data: payload.values,
    entityReferences: entityRefs,
    submittedAt: isDraft ? null : now,
    createdAt: now,
    updatedAt: now,
  });
}

export { RECORD_COMMAND_TYPES, RECORD_COMMAND_ERROR_CODES };

/**
 * Validates an UPDATE_DRAFT command against the Record's historical Module
 * Version schema. Draft updates are intentionally PARTIAL: only supplied
 * values are type-checked — required-field enforcement happens at
 * SUBMIT_RECORD, not during drafting.
 *
 * @param {import('./recordCommandContract.js').RecordCommand} command
 * @param {import('../../modules/module.js').ModuleDefinition} module — with the RECORD's historical formSchema
 * @returns {{ valid: boolean, errors: string[], code?: string, entityRefs?: Object[] }}
 */
export function validateUpdateDraftCommand(command, module) {
  const envelope = validateRecordCommand(command);
  if (!envelope.valid) return envelope;
  if (command.commandType !== RECORD_COMMAND_TYPES.UPDATE_DRAFT) {
    return { valid: false, errors: [`Expected UPDATE_DRAFT, got ${command.commandType}`], code: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  if (!module) {
    return { valid: false, errors: ['Module not found'], code: RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND };
  }
  const fields = module.formSchema?.fields || [];
  if (fields.length === 0) {
    return { valid: false, errors: ['Module has no form fields defined'], code: RECORD_COMMAND_ERROR_CODES.SCHEMA_INVALID };
  }

  const values = command.payload.values || {};
  const declaredKeys = new Set(fields.map((f) => f.key));
  const errors = [];
  for (const key of Object.keys(values)) {
    if (!declaredKeys.has(key)) errors.push(`Undeclared field: "${key}" is not in the form schema`);
  }
  if (errors.length) {
    return { valid: false, errors, code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }

  const partialFields = fields.map((field) => ({ ...field, required: false }));
  const validation = validateFormValues(values, partialFields);
  if (!validation.valid) {
    return { valid: false, errors: Object.values(validation.errors), code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }

  const entityRefs = extractEntityReferences(values, partialFields);
  for (const ref of entityRefs) {
    const refResult = validateEntityReference(ref);
    if (!refResult.valid) {
      errors.push(`Invalid entity reference: ${refResult.errors.join(', ')}`);
    } else if (ref.workspaceId !== command.payload.workspaceId) {
      errors.push('Cross-workspace entity reference denied');
    }
  }
  if (errors.length) {
    return { valid: false, errors, code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }

  return { valid: true, errors: [], entityRefs };
}

/**
 * Full validation for SUBMIT_RECORD: the Record's stored data against the
 * exact historical Module Version schema. Required fields must be satisfied.
 */
export function validateSubmitRecordCommand(command, record, module) {
  const envelope = validateRecordCommand(command);
  if (!envelope.valid) return envelope;
  if (command.commandType !== RECORD_COMMAND_TYPES.SUBMIT_RECORD) {
    return { valid: false, errors: [`Expected SUBMIT_RECORD, got ${command.commandType}`], code: RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND };
  }
  if (!module) {
    return { valid: false, errors: ['Module not found'], code: RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND };
  }
  const fields = module.formSchema?.fields || [];
  const validation = validateFormValues(record?.data || {}, fields);
  if (!validation.valid) {
    return { valid: false, errors: Object.values(validation.errors), code: RECORD_COMMAND_ERROR_CODES.RECORD_INVALID };
  }
  return { valid: true, errors: [] };
}

/**
 * Builds the canonical Firestore patch for a mutation command. Identity,
 * actor and timestamp fields are derived by the trusted executor, never by
 * the command payload.
 *
 * @param {Object} params
 * @param {string} params.commandType
 * @param {import('./recordCommandContract.js').RecordCommand} params.command
 * @param {Object} params.record — current canonical Record
 * @param {string[]} params.fields — historical schema fields (UPDATE_DRAFT)
 * @param {string} params.actorId — verified server-side user id
 * @param {string} params.now — server-authoritative ISO timestamp
 * @returns {Object} patch
 */
export function buildRecordMutationPatch({ commandType, command, record, fields = [], actorId, now = new Date().toISOString() }) {
  const actor = userActor(actorId);
  switch (commandType) {
    case RECORD_COMMAND_TYPES.UPDATE_DRAFT: {
      const values = command.payload.values || {};
      const entityRefs = extractEntityReferences(values, fields);
      return {
        data: values,
        entityReferences: entityRefs,
        entityReferenceIds: deriveEntityReferenceIds(entityRefs),
      };
    }
    case RECORD_COMMAND_TYPES.SUBMIT_RECORD:
      return {
        status: RECORD_STATUSES.SUBMITTED,
        submittedBy: { actorType: actor.actorType, actorId: actor.actorId },
        submittedAt: now,
      };
    case RECORD_COMMAND_TYPES.SET_PRIORITY: {
      const priority = command.payload.priority ?? null;
      if (priority !== null && !RECORD_PRIORITIES[priority]) {
        throw new Error(`Invalid priority: ${priority}`);
      }
      return { priority };
    }
    case RECORD_COMMAND_TYPES.ARCHIVE_RECORD:
      return {
        status: RECORD_STATUSES.ARCHIVED,
        _previousStatus: record.status === RECORD_STATUSES.ARCHIVED ? (record._previousStatus ?? null) : record.status,
        archivedAt: record.archivedAt ?? now,
        archivedBy: record.archivedBy ?? { actorType: actor.actorType, actorId: actor.actorId },
      };
    case RECORD_COMMAND_TYPES.RESTORE_RECORD:
      return {
        status: record._previousStatus && RECORD_STATUSES[record._previousStatus] ? record._previousStatus : RECORD_STATUSES.ACTIVE,
        _previousStatus: null,
        archivedAt: null,
        archivedBy: null,
      };
    case RECORD_COMMAND_TYPES.CANCEL_RECORD:
      return { status: RECORD_STATUSES.CANCELLED };
    default:
      throw new Error(`No mutation patch for command ${commandType}`);
  }
}
