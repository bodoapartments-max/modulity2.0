import { describe, it, expect } from 'vitest';
import { createFileMeta } from './file.js';

describe('file', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    fileId: 'file-1',
    workspaceId: 'ws-1',
    name: 'report.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: 'workspaces/ws-1/files/report.pdf',
    uploadedBy: actorRef,
  };

  it('creates valid file metadata', () => {
    const file = createFileMeta(baseArgs);
    expect(file.fileId).toBe('file-1');
    expect(file.name).toBe('report.pdf');
    expect(file.size).toBe(1024);
    expect(file.storageProvider).toBe('firebase-storage');
  });

  it('rejects a missing fileId', () => {
    expect(() => createFileMeta({ ...baseArgs, fileId: '' })).toThrow('fileId is required');
  });

  it('rejects a missing workspaceId', () => {
    expect(() => createFileMeta({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects a missing name', () => {
    expect(() => createFileMeta({ ...baseArgs, name: '' })).toThrow('name is required');
  });

  it('rejects a missing mimeType', () => {
    expect(() => createFileMeta({ ...baseArgs, mimeType: '' })).toThrow('mimeType is required');
  });

  it('rejects a missing storagePath', () => {
    expect(() => createFileMeta({ ...baseArgs, storagePath: '' })).toThrow('storagePath is required');
  });

  it('rejects a missing uploadedBy', () => {
    expect(() => createFileMeta({ ...baseArgs, uploadedBy: null })).toThrow('uploadedBy is required');
  });

  it('rejects a negative size', () => {
    expect(() => createFileMeta({ ...baseArgs, size: -1 })).toThrow('size must be a non-negative number');
  });

  it('rejects a non-number size', () => {
    expect(() => createFileMeta({ ...baseArgs, size: '1024' })).toThrow('size must be a non-negative number');
  });

  it('defaults storageProvider to firebase-storage', () => {
    const file = createFileMeta(baseArgs);
    expect(file.storageProvider).toBe('firebase-storage');
  });

  it('returns a frozen result', () => {
    const file = createFileMeta(baseArgs);
    expect(Object.isFrozen(file)).toBe(true);
  });
});
