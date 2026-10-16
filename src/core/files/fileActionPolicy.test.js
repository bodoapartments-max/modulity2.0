import { describe, it, expect } from 'vitest';
import { evaluateFileAction, attachmentTargetDocPath } from './fileActionPolicy.js';
import { FILE_COMMAND_TYPES } from './fileCommandContract.js';

const authed = { authenticated: true, workspaceAccess: 'PERSONAL_OWNER' };
const anon = { authenticated: false, workspaceAccess: null };
const activeFile = { status: 'ACTIVE' };
const archivedFile = { status: 'ARCHIVED' };
const activeAtt = { status: 'ACTIVE' };

describe('evaluateFileAction', () => {
  it('requires authentication and workspace access', () => {
    expect(evaluateFileAction({ actorContext: anon, action: 'CREATE_FILE' }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: { authenticated: true, workspaceAccess: null }, action: 'CREATE_FILE' }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: authed, action: 'CREATE_FILE' }).allowed).toBe(true);
  });
  it('gates version/attach/archive on ACTIVE files', () => {
    expect(evaluateFileAction({ actorContext: authed, file: activeFile, action: FILE_COMMAND_TYPES.CREATE_FILE_VERSION }).allowed).toBe(true);
    expect(evaluateFileAction({ actorContext: authed, file: archivedFile, action: FILE_COMMAND_TYPES.CREATE_FILE_VERSION }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: authed, file: archivedFile, target: {}, action: FILE_COMMAND_TYPES.ATTACH_FILE }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: authed, file: archivedFile, action: FILE_COMMAND_TYPES.ARCHIVE_FILE }).allowed).toBe(false);
  });
  it('restore is only valid from ARCHIVED', () => {
    expect(evaluateFileAction({ actorContext: authed, file: archivedFile, action: FILE_COMMAND_TYPES.RESTORE_FILE }).allowed).toBe(true);
    expect(evaluateFileAction({ actorContext: authed, file: activeFile, action: FILE_COMMAND_TYPES.RESTORE_FILE }).allowed).toBe(false);
  });
  it('detach is only valid on ACTIVE attachments', () => {
    expect(evaluateFileAction({ actorContext: authed, attachment: activeAtt, action: FILE_COMMAND_TYPES.DETACH_FILE }).allowed).toBe(true);
    expect(evaluateFileAction({ actorContext: authed, attachment: { status: 'DETACHED' }, action: FILE_COMMAND_TYPES.DETACH_FILE }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: authed, attachment: null, action: FILE_COMMAND_TYPES.DETACH_FILE }).allowed).toBe(false);
  });
  it('attach requires an existing target', () => {
    expect(evaluateFileAction({ actorContext: authed, file: activeFile, target: null, action: FILE_COMMAND_TYPES.ATTACH_FILE }).allowed).toBe(false);
    expect(evaluateFileAction({ actorContext: authed, file: activeFile, target: {}, action: FILE_COMMAND_TYPES.ATTACH_FILE }).allowed).toBe(true);
  });
});

describe('attachmentTargetDocPath — closed target mapping', () => {
  it('maps only RECORD and ENTITY', () => {
    expect(attachmentTargetDocPath('RECORD', 'ws', 'r1')).toBe('workspaces/ws/records/r1');
    expect(attachmentTargetDocPath('ENTITY', 'ws', 'e1')).toBe('workspaces/ws/entities/e1');
    expect(attachmentTargetDocPath('CONVERSATION', 'ws', 'c')).toBe(null);
    expect(attachmentTargetDocPath('auditEntries', 'ws', 'a')).toBe(null);
  });
});
