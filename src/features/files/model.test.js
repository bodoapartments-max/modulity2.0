import { describe, it, expect } from 'vitest';
import { createInMemoryFileStorageAdapter } from '../../core/files/inMemoryFileStorageAdapter.js';
import { uploadCanonicalFile, uploadAndAttachFile, formatFileSize, sha256HexOfBlob } from './model.js';

// Minimal Blob-like stand-in exposing the surface the pipeline needs.
function fakeFile({ name, type = 'application/pdf', content = 'x' }) {
  const bytes = new TextEncoder().encode(content);
  return { name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}

function fakeCommand() {
  const created = [];
  const attached = [];
  return {
    created,
    attached,
    async createFile(cmd) { created.push(cmd); return { resource: { fileId: `f_${cmd.operationId}` } }; },
    async attachFile(cmd) { attached.push(cmd); return { resource: { attachmentId: 'att_x' } }; },
  };
}

describe('uploadCanonicalFile — client pipeline', () => {
  it('uploads bytes to the canonical path then registers via trusted command', async () => {
    const storage = createInMemoryFileStorageAdapter();
    const fileCommand = fakeCommand();
    const browserFile = fakeFile({ name: '../evil path/report.pdf', content: 'hello' });
    const { fileId } = await uploadCanonicalFile({ storage, fileCommand, workspaceId: 'ws-1', browserFile });

    expect(fileId).toMatch(/^f_/);
    // Bytes landed at the canonical workspace-scoped path — sanitized name.
    const paths = [...storage._dump().keys()];
    expect(paths.length).toBe(1);
    expect(paths[0]).toMatch(/^workspaces\/ws-1\/files\/f_[^/]+\/v1\//);
    expect(paths[0]).not.toContain('..');
    // Command carried checksum + metadata, never a path.
    expect(fileCommand.created.length).toBe(1);
    expect(fileCommand.created[0].checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(fileCommand.created[0]).not.toHaveProperty('storagePath');
  });

  it('produces the real SHA-256 of the content', async () => {
    const hex = await sha256HexOfBlob(fakeFile({ content: 'abc' }));
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('rejects oversized and unusable files before uploading', async () => {
    const storage = createInMemoryFileStorageAdapter();
    const fileCommand = fakeCommand();
    await expect(uploadCanonicalFile({
      storage, fileCommand, workspaceId: 'ws-1',
      browserFile: { name: 'big.bin', type: 'application/octet-stream', size: 51 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) },
    })).rejects.toThrow(/size/i);
    expect(storage._dump().size).toBe(0);
    await expect(uploadCanonicalFile({
      storage, fileCommand, workspaceId: 'ws-1',
      browserFile: fakeFile({ name: '..' }),
    })).rejects.toThrow();
  });
});

describe('uploadAndAttachFile', () => {
  it('creates then attaches to the target', async () => {
    const storage = createInMemoryFileStorageAdapter();
    const fileCommand = fakeCommand();
    await uploadAndAttachFile({
      storage, fileCommand, workspaceId: 'ws-1',
      browserFile: fakeFile({ name: 'reg.pdf' }),
      targetType: 'RECORD', targetId: 'rec-1',
    });
    expect(fileCommand.created.length).toBe(1);
    expect(fileCommand.attached.length).toBe(1);
    expect(fileCommand.attached[0].targetType).toBe('RECORD');
    expect(fileCommand.attached[0].fileId).toMatch(/^f_/);
  });
});

describe('formatFileSize', () => {
  it('renders bounded human sizes', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(-1)).toBe('—');
  });
});
