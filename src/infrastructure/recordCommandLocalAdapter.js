/**
 * Modulity 2.0 — Local Trusted Record Command Adapter (test + fallback)
 *
 * Performs the same deterministic validation and canonical Record creation
 * as the server-side command engine, but using the local repository layer.
 *
 * This adapter is intended for:
 *   - unit/integration tests that run outside the Functions emulator;
 *   - local development fallback when the trusted callable is unavailable.
 *
 * It does NOT provide the same concurrent-idempotency guarantees as the
 * server-side operation journal.
 *
 * @module infrastructure/recordCommandLocalAdapter
 */

import { buildCreateRecordCommand } from '../core/recordCommands/recordCommandContract.js';
import {
  validateCreateRecordCommand,
  buildCanonicalRecordFromCommand,
} from '../core/recordCommands/recordCommandEngine.js';
import { AppError } from '../core/errors/appError.js';
import { generateId } from '../core/utils/generateId.js';

function mapErrorCode(code) {
  const map = {
    MODULE_NOT_FOUND: 'not_found',
    MODULE_NOT_ACTIVE: 'forbidden',
    MODULE_FORBIDDEN: 'forbidden',
    RECORD_INVALID: 'validation_error',
    ENTITY_REFERENCE_INVALID: 'validation_error',
    UNSUPPORTED_CONTRACT_VERSION: 'validation_error',
    UNSUPPORTED_COMMAND: 'validation_error',
    OPERATION_INVALID: 'validation_error',
  };
  return map[code] || 'unknown';
}

export function createRecordCommandLocalAdapter({ recordService, entityService, moduleRepo }) {
  async function execute(command) {
    const module = await moduleRepo.getById(command.payload.workspaceId, command.payload.moduleId);
    const validation = validateCreateRecordCommand(command, module);
    if (!validation.valid) {
      throw new AppError(mapErrorCode(validation.code), validation.errors.join('; '));
    }

    const entityRefs = validation.entityRefs || [];
    if (entityRefs.length > 0 && entityService) {
      await entityService.resolveEntityReferences(entityRefs, command.payload.workspaceId);
    }

    const record = await recordService.createRecord(
      buildCanonicalRecordFromCommand({
        command,
        module,
        actorId: command.payload.__actorId || 'local-test',
        recordId: generateId(),
        now: new Date().toISOString(),
      }),
    );

    return { record, operationId: command.operationId, idempotent: false };
  }

  async function submit({ workspaceId, moduleId, actor, values, isDraft = false, operationId = generateId() }) {
    const command = buildCreateRecordCommand({ operationId, workspaceId, moduleId, values, isDraft });
    // __actorId is a non-contract internal flag used only by the local adapter;
    // the server-side engine derives the actor from verified Firebase Auth.
    return execute({ ...command, payload: { ...command.payload, __actorId: actor.actorId } });
  }

  return Object.freeze({ execute, submit });
}
