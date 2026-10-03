import { describe, it, expect } from 'vitest';
import { evaluateRecordAction, RECORD_ACTIONS } from './recordActionPolicy.js';
import { RECORD_COMMAND_ERROR_CODES } from './recordCommandContract.js';

const ownerCtx = { authenticated: true, workspaceAccess: 'PERSONAL_OWNER' };
const memberCtx = { authenticated: true, workspaceAccess: 'ORGANIZATION_MEMBER' };
const noCtx = { authenticated: true, workspaceAccess: null };
const anonCtx = { authenticated: false, workspaceAccess: null };

const draft = { status: 'DRAFT' };
const submitted = { status: 'SUBMITTED' };
const archived = { status: 'ARCHIVED', _previousStatus: 'ACTIVE' };

const activeModule = { moduleId: 'mod-1', status: 'ACTIVE' };
const inactiveModule = { moduleId: 'mod-1', status: 'INACTIVE' };

describe('recordActionPolicy', () => {
  it('requires authentication', () => {
    const result = evaluateRecordAction({ actorContext: anonCtx, record: draft, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.UNAUTHENTICATED);
  });

  it('requires workspace access', () => {
    const result = evaluateRecordAction({ actorContext: noCtx, record: draft, action: RECORD_ACTIONS.ARCHIVE_RECORD });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.WORKSPACE_FORBIDDEN);
  });

  it('allows SUBMIT_RECORD for a workspace owner on a DRAFT with an ACTIVE module', () => {
    const result = evaluateRecordAction({ actorContext: ownerCtx, record: draft, module: activeModule, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(true);
  });

  it('allows SUBMIT_RECORD for an active organization member', () => {
    const result = evaluateRecordAction({ actorContext: memberCtx, record: draft, module: activeModule, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(true);
  });

  it('denies SUBMIT_RECORD when the source Module is inactive', () => {
    const result = evaluateRecordAction({ actorContext: ownerCtx, record: draft, module: inactiveModule, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.MODULE_NOT_ACTIVE);
  });

  it('denies SUBMIT_RECORD when the source Module is missing', () => {
    const result = evaluateRecordAction({ actorContext: ownerCtx, record: draft, module: null, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.MODULE_NOT_FOUND);
  });

  it('denies SUBMIT_RECORD on a submitted Record', () => {
    const result = evaluateRecordAction({ actorContext: ownerCtx, record: submitted, module: activeModule, action: RECORD_ACTIONS.SUBMIT_RECORD });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.INVALID_RECORD_STATE);
  });

  it('EDIT_DRAFT mirrors the draft-only rule', () => {
    expect(evaluateRecordAction({ actorContext: ownerCtx, record: draft, action: RECORD_ACTIONS.EDIT_DRAFT }).allowed).toBe(true);
    expect(evaluateRecordAction({ actorContext: ownerCtx, record: submitted, action: RECORD_ACTIONS.EDIT_DRAFT }).allowed).toBe(false);
  });

  it('RESTORE_RECORD requires an archived Record', () => {
    expect(evaluateRecordAction({ actorContext: ownerCtx, record: submitted, action: RECORD_ACTIONS.RESTORE_RECORD }).allowed).toBe(false);
    expect(evaluateRecordAction({ actorContext: ownerCtx, record: archived, action: RECORD_ACTIONS.RESTORE_RECORD }).allowed).toBe(true);
  });

  it('rejects unknown actions', () => {
    const result = evaluateRecordAction({ actorContext: ownerCtx, record: draft, action: 'APPROVE_RECORD' });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  });
});
