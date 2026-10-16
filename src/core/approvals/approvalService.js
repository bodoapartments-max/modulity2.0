/**
 * Modulity 2.0 — Approval Read Service (Step 31)
 *
 * Read-side surface for canonical ApprovalCase / ApprovalDefinition
 * documents. No writes — all mutations go through the trusted
 * approvalCommand boundary.
 *
 * @module core/approvals/approvalService
 */

import { AppError } from '../errors/appError.js';
import { APPROVAL_COMMAND_ERROR_CODES } from './approvalCommandContract.js';

export function createApprovalService({ approvalRepo }) {
  function assertWorkspaceDoc(doc, workspaceId) {
    if (!doc || doc.workspaceId !== workspaceId) {
      throw new AppError(APPROVAL_COMMAND_ERROR_CODES.APPROVAL_NOT_FOUND, 'Not found.');
    }
    return doc;
  }

  async function getApprovalCase(workspaceId, approvalCaseId) {
    return assertWorkspaceDoc(await approvalRepo.getCaseById(workspaceId, approvalCaseId), workspaceId);
  }

  async function listApprovalCasesForSubject(workspaceId, subjectType, subjectId) {
    return approvalRepo.listCasesBySubject(workspaceId, subjectType, subjectId);
  }

  async function listApprovalCasesForRequester(workspaceId, requesterUserId) {
    return approvalRepo.listCasesByRequester(workspaceId, requesterUserId);
  }

  async function getApprovalDefinition(workspaceId, approvalDefinitionId) {
    const def = await approvalRepo.getDefinitionById(workspaceId, approvalDefinitionId);
    if (!def || def.workspaceId !== workspaceId) {
      throw new AppError(APPROVAL_COMMAND_ERROR_CODES.DEFINITION_NOT_FOUND, 'Approval definition not found.');
    }
    return def;
  }

  async function listActiveDefinitions(workspaceId) {
    return approvalRepo.listActiveDefinitions(workspaceId);
  }

  return Object.freeze({
    getApprovalCase,
    listApprovalCasesForSubject,
    listApprovalCasesForRequester,
    getApprovalDefinition,
    listActiveDefinitions,
  });
}
