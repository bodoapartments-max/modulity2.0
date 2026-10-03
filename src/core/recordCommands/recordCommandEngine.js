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
import { createRecord, RECORD_STATUSES } from '../data/record.js';
import { validateEntityReference } from '../data/entity.js';
import { userActor } from '../data/actorRef.js';
import { generateId } from '../utils/generateId.js';

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
