import { describe, it, expect } from 'vitest';
import {
  buildCanonicalFileFromCommand,
  buildNextFileVersionFromCommand,
  buildAttachmentFromCommand,
  buildFileMutationPatch,
} from './fileCommandEngine.js';
import { buildCreateFileCommand, buildAttachFileCommand } from './fileCommandContract.js';

const SHA = 'a'.repeat(64);

function createCommand(overrides = {}) {
  return buildCreateFileCommand({
    operationId: 'op-9', workspaceId: 'ws-1',
    name: '../Invoice (final).PDF', mimeType: 'application/pdf', size: 100, checksum: SHA,
    ...overrides,
  });
}

describe('buildCanonicalFileFromCommand', () => {
  it('derives identity, sanitized name, storage path server-side', () => {
    const { file, version } = buildCanonicalFileFromCommand({ command: createCommand(), actorId: 'u-1', now: '2026-01-01T00:00:00.000Z' });
    expect(file.fileId).toBe('f_op-9');
    expect(file.name).toBe('_Invoice (final).PDF');
    expect(file.extension).toBe('pdf');
    expect(file.storagePath).toBe('workspaces/ws-1/files/f_op-9/v1/_Invoice (final).PDF');
    expect(file.createdBy).toEqual({ actorType: 'USER', actorId: 'u-1' });
    expect(file.status).toBe('ACTIVE');
    expect(file.source).toBe('USER_UPLOAD');
    expect(version.version).toBe(1);
    expect(version.fileVersionId).toBe('v1');
    expect(version.storagePath).toBe(file.storagePath);
  });
  it('rejects names with no usable characters', () => {
    expect(() => buildCanonicalFileFromCommand({ command: createCommand({ name: '..' }), actorId: 'u' })).toThrow();
  });
});

describe('buildNextFileVersionFromCommand', () => {
  it('appends version N+1 and moves the file head', () => {
    const file = { fileId: 'f_1', name: 'a.pdf', displayName: 'a.pdf', currentVersion: 1 };
    const command = { operationId: 'op-2', payload: { workspaceId: 'ws-1', fileId: 'f_1', name: 'b.pdf', mimeType: 'application/pdf', size: 5, checksum: SHA } };
    const { version, filePatch } = buildNextFileVersionFromCommand({ command, file, actorId: 'u-1', now: 'n' });
    expect(version.version).toBe(2);
    expect(version.fileVersionId).toBe('v2');
    expect(version.storagePath).toContain('/v2/b.pdf');
    expect(filePatch.currentVersion).toBe(2);
    expect(filePatch.storagePath).toBe(version.storagePath);
    expect(filePatch.name).toBe('b.pdf');
  });
  it('keeps the previous name when the command omits one', () => {
    const file = { fileId: 'f_1', name: 'a.pdf', displayName: 'a.pdf', currentVersion: 2 };
    const command = { operationId: 'op-3', payload: { workspaceId: 'ws-1', fileId: 'f_1', mimeType: 'application/pdf', size: 5, checksum: SHA } };
    const { version } = buildNextFileVersionFromCommand({ command, file, actorId: 'u-1' });
    expect(version.name).toBe('a.pdf');
    expect(version.version).toBe(3);
  });
});

describe('buildAttachmentFromCommand', () => {
  it('pins the file version at attach time', () => {
    const command = buildAttachFileCommand({ operationId: 'op-att', workspaceId: 'ws-1', fileId: 'f_1', targetType: 'RECORD', targetId: 'rec-1' });
    const att = buildAttachmentFromCommand({ command, file: { fileId: 'f_1', currentVersion: 3 }, actorId: 'u-1', now: 't' });
    expect(att.attachmentId).toBe('att_op-att');
    expect(att.fileVersion).toBe(3);
    expect(att.targetType).toBe('RECORD');
    expect(att.status).toBe('ACTIVE');
  });
});

describe('buildFileMutationPatch', () => {
  it('emits the correct lifecycle patches', () => {
    expect(buildFileMutationPatch({ commandType: 'ARCHIVE_FILE', actorId: 'u', now: 'n' }).status).toBe('ARCHIVED');
    expect(buildFileMutationPatch({ commandType: 'RESTORE_FILE', actorId: 'u', now: 'n' }).status).toBe('ACTIVE');
    expect(buildFileMutationPatch({ commandType: 'DETACH_FILE', actorId: 'u', now: 'n' }).status).toBe('DETACHED');
    expect(() => buildFileMutationPatch({ commandType: 'CREATE_FILE', actorId: 'u' })).toThrow();
  });
});
