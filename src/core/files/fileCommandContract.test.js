import { describe, it, expect } from 'vitest';
import {
  validateFileCommand,
  buildCreateFileCommand,
  buildCreateFileVersionCommand,
  buildAttachFileCommand,
  buildDetachFileCommand,
  buildArchiveFileCommand,
  buildRestoreFileCommand,
  FILE_COMMAND_TYPES,
  FILE_COMMAND_ERROR_CODES,
} from './fileCommandContract.js';

const SHA = 'a'.repeat(64);
const validFile = { name: 'doc.pdf', mimeType: 'application/pdf', size: 10, checksum: SHA };

function cmd(type, payload, operationId = 'op-1') {
  return { contractVersion: '1.0.0', operationId, commandType: type, payload: { workspaceId: 'ws-1', ...payload } };
}

describe('validateFileCommand — envelope', () => {
  it('accepts a valid CREATE_FILE', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', validFile)).valid).toBe(true);
  });
  it('rejects unsupported contract versions and command types', () => {
    expect(validateFileCommand({ ...cmd('CREATE_FILE', validFile), contractVersion: '9.9' }).code)
      .toBe(FILE_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION);
    expect(validateFileCommand(cmd('DELETE_EVERYTHING', {})).code)
      .toBe(FILE_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
    expect(validateFileCommand(null).valid).toBe(false);
  });
  it('requires operationId and workspaceId', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', validFile, '')).valid).toBe(false);
    const noWs = cmd('CREATE_FILE', validFile);
    delete noWs.payload.workspaceId;
    expect(validateFileCommand(noWs).valid).toBe(false);
  });
});

describe('validateFileCommand — protected fields', () => {
  const forbidden = ['actor', 'actorId', 'createdBy', 'createdAt', 'status', 'storagePath', 'storageProvider', 'currentVersion', 'version'];
  it.each(forbidden)('rejects server-authoritative field %s', (key) => {
    const r = validateFileCommand(cmd('CREATE_FILE', { ...validFile, [key]: 'x' }));
    expect(r.valid).toBe(false);
  });
  it('rejects command-scoped resource ids that must be server-derived', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, fileId: 'f_evil' })).valid).toBe(false);
    expect(validateFileCommand(cmd('ATTACH_FILE', { fileId: 'f_1', targetType: 'RECORD', targetId: 'r', attachmentId: 'a' })).valid).toBe(false);
  });
});

describe('validateFileCommand — per-command payloads', () => {
  it('validates file content descriptors', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, size: -1 })).valid).toBe(false);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, mimeType: 'bad' })).valid).toBe(false);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, checksum: 'zz' })).valid).toBe(false);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, name: '..' })).valid).toBe(false);
  });
  it('rejects secret-looking metadata keys', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, metadata: { apiKey: 'x' } })).valid).toBe(false);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, metadata: { note: 'ok' } })).valid).toBe(true);
  });
  it('rejects non-client-claimable provenance', () => {
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, source: 'USER_UPLOAD' })).valid).toBe(true);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, source: 'GENERATED' })).valid).toBe(false);
    expect(validateFileCommand(cmd('CREATE_FILE', { ...validFile, source: 'NOPE' })).valid).toBe(false);
  });
  it('validates ATTACH_FILE targets against the closed set', () => {
    expect(validateFileCommand(cmd('ATTACH_FILE', { fileId: 'f_1', targetType: 'RECORD', targetId: 'r1' })).valid).toBe(true);
    expect(validateFileCommand(cmd('ATTACH_FILE', { fileId: 'f_1', targetType: 'ENTITY', targetId: 'e1' })).valid).toBe(true);
    expect(validateFileCommand(cmd('ATTACH_FILE', { fileId: 'f_1', targetType: 'CONVERSATION', targetId: 'c' })).valid).toBe(false);
    expect(validateFileCommand(cmd('ATTACH_FILE', { fileId: 'f_1', targetType: 'auditEntries', targetId: 'c' })).valid).toBe(false);
  });
  it('validates DETACH/ARCHIVE/RESTORE resource references', () => {
    expect(validateFileCommand(cmd('DETACH_FILE', {})).valid).toBe(false);
    expect(validateFileCommand(cmd('DETACH_FILE', { attachmentId: 'att_1' })).valid).toBe(true);
    expect(validateFileCommand(cmd('ARCHIVE_FILE', {})).valid).toBe(false);
    expect(validateFileCommand(cmd('ARCHIVE_FILE', { fileId: 'f_1' })).valid).toBe(true);
    expect(validateFileCommand(cmd('RESTORE_FILE', { fileId: 'f_1' })).valid).toBe(true);
    expect(validateFileCommand(cmd('CREATE_FILE_VERSION', { fileId: 'f_1', ...validFile })).valid).toBe(true);
    expect(validateFileCommand(cmd('CREATE_FILE_VERSION', { ...validFile })).valid).toBe(false);
  });
});

describe('command builders', () => {
  it('produce frozen envelopes without server fields', () => {
    const c = buildCreateFileCommand({ operationId: 'op-1', workspaceId: 'ws-1', ...validFile });
    expect(c.commandType).toBe(FILE_COMMAND_TYPES.CREATE_FILE);
    expect(c.payload.workspaceId).toBe('ws-1');
    expect('fileId' in c.payload).toBe(false);
    expect(Object.isFrozen(c.payload)).toBe(true);
    expect(buildCreateFileVersionCommand({ operationId: 'o', workspaceId: 'w', fileId: 'f', ...validFile }).payload.fileId).toBe('f');
    expect(buildAttachFileCommand({ operationId: 'o', workspaceId: 'w', fileId: 'f', targetType: 'RECORD', targetId: 'r' }).commandType).toBe('ATTACH_FILE');
    expect(buildDetachFileCommand({ operationId: 'o', workspaceId: 'w', attachmentId: 'a' }).payload.attachmentId).toBe('a');
    expect(buildArchiveFileCommand({ operationId: 'o', workspaceId: 'w', fileId: 'f' }).commandType).toBe('ARCHIVE_FILE');
    expect(buildRestoreFileCommand({ operationId: 'o', workspaceId: 'w', fileId: 'f' }).commandType).toBe('RESTORE_FILE');
  });
});
