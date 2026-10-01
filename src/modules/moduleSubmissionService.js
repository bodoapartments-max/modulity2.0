/**
 * Modulity 2.0 — Module Submission Service
 *
 * Deterministic orchestrator for Module-driven Record creation.
 *
 * Pipeline:
 *   Module Definition → Form values → Validation → Entity Reference resolution
 *   → Record creation → Platform event
 *
 * React-independent. Testable with mock repositories.
 *
 * @module modules/moduleSubmissionService
 */

import { MODULE_STATUSES } from './module.js';
import { validateFormValues, extractEntityReferences } from './forms/formSchemaValidator.js';
import { RECORD_STATUSES } from '../core/data/record.js';
import { eventBus, createEvent } from '../core/events/eventBus.js';
import { AppError } from '../core/errors/appError.js';

/**
 * @param {Object} deps
 * @param {import('./moduleRepository.js').ModuleRepository} deps.moduleRepo
 * @param {import('../core/data/recordService.js')} deps.recordService — the wired record service
 * @param {import('../core/data/entityService.js')} deps.entityService — for reference resolution
 */
export function createModuleSubmissionService({ moduleRepo, recordService, entityService }) {
  /**
   * Submits a Module record.
   *
   * 1. Load Module
   * 2. Verify Module is ACTIVE (or DRAFT for preview/test)
   * 3. Validate values against Form Schema
   * 4. Resolve/validate Entity References
   * 5. Derive canonical Record fields
   * 6. Create ONE Record via RecordService
   * 7. Emit platform event
   * 8. Return created Record
   *
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {string} params.moduleId
   * @param {Object} params.actor — ActorRef
   * @param {Object} params.values — form field values keyed by field key
   * @param {boolean} [params.isDraft=false] — save as draft instead of submitting
   * @returns {Promise<Object>} — the created Record
   */
  async function submitModuleRecord({ workspaceId, moduleId, actor, values, isDraft = false }) {
    // 1. Load Module
    const mod = await moduleRepo.getById(workspaceId, moduleId);
    if (!mod) {
      throw new AppError('not_found', `Module not found: ${moduleId}`);
    }

    // 2. Verify Module status
    if (mod.status === MODULE_STATUSES.ARCHIVED) {
      throw new AppError('forbidden', 'Cannot create records with an archived module');
    }
    if (mod.status === MODULE_STATUSES.INACTIVE) {
      throw new AppError('forbidden', 'Cannot create records with an inactive module');
    }
    // ACTIVE: normal submission. DRAFT: allowed for preview/test.
    if (mod.status !== MODULE_STATUSES.ACTIVE && mod.status !== MODULE_STATUSES.DRAFT) {
      throw new AppError('forbidden', `Module status "${mod.status}" does not allow record creation`);
    }

    // 3. Validate values against Form Schema
    const fields = mod.formSchema?.fields || [];
    if (fields.length === 0) {
      throw new AppError('validation_error', 'Module has no form fields defined');
    }

    const validation = validateFormValues(values, fields);
    if (!validation.valid) {
      throw new AppError('validation_error', 'Form validation failed', validation.errors);
    }

    // 4. Extract and resolve Entity References
    const entityRefs = extractEntityReferences(values, fields);
    if (entityRefs.length > 0 && entityService) {
      await entityService.resolveEntityReferences(entityRefs, workspaceId);
    }

    // 5 & 6. Create ONE Record via RecordService
    // Capture the exact Module version used for validation.
    // This version is immutable on the Record — historical interpretation
    // must always use this exact version, never the "current" Module schema.
    const moduleVersion = mod.version;
    const status = isDraft ? RECORD_STATUSES.DRAFT : RECORD_STATUSES.SUBMITTED;
    const now = new Date().toISOString();

    const record = await recordService.createRecord({
      workspaceId,
      moduleId: mod.moduleId,
      moduleVersion,
      recordType: mod.recordConfig?.recordType || mod.moduleCode,
      status,
      createdBy: actor,
      submittedBy: isDraft ? null : actor,
      data: values,
      entityReferences: entityRefs,
      submittedAt: isDraft ? null : now,
    });

    // 7. Emit platform event
    const eventType = isDraft ? 'module.record_draft_saved' : 'module.record_submitted';
    eventBus.emit(createEvent({
      eventType,
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: {
        recordId: record.recordId,
        moduleId: mod.moduleId,
        moduleCode: mod.moduleCode,
        moduleVersion: mod.version,
      },
    }));

    return record;
  }

  /**
   * Saves a draft Record for a Module.
   */
  async function saveDraft({ workspaceId, moduleId, actor, values }) {
    return submitModuleRecord({ workspaceId, moduleId, actor, values, isDraft: true });
  }

  /**
   * Submits a draft Record (changes status from DRAFT to SUBMITTED).
   */
  async function submitDraft({ workspaceId, recordId, actor }) {
    const record = await recordService.getRecord(workspaceId, recordId);
    if (!record) {
      throw new AppError('not_found', 'Record not found');
    }
    if (record.status !== RECORD_STATUSES.DRAFT) {
      throw new AppError('forbidden', 'Only draft records can be submitted');
    }

    const now = new Date().toISOString();
    const updated = await recordService.updateDraftRecord(workspaceId, recordId, {
      status: RECORD_STATUSES.SUBMITTED,
      submittedBy: actor,
      submittedAt: now,
    }, actor);

    eventBus.emit(createEvent({
      eventType: 'module.record_submitted',
      workspaceId,
      actor: { type: actor.actorType === 'USER' ? 'user' : 'service', id: actor.actorId },
      payload: { recordId, moduleId: record.moduleId },
    }));

    return updated;
  }

  return {
    submitModuleRecord,
    saveDraft,
    submitDraft,
  };
}
