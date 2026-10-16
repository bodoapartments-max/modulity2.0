import { describe, it, expect } from 'vitest';
import { createFile, FILE_STATUSES, FILE_SOURCES, CLIENT_CLAIMABLE_FILE_SOURCES } from './file.js';
import { createFileVersion, fileVersionDocId } from './fileVersion.js';
import { createFileAttachment, ATTACHMENT_TARGET_TYPES, RESERVED_ATTACHMENT_TARGET_TYPES } from './fileAttachment.js';

const actor = { actorType: 'USER', actorId: 'u-1' };

const baseFile = {
  fileId: 'f_1',
  workspaceId: 'ws-1',
  name: 'doc.pdf',
  mimeType: 'application/pdf',
  size: 10,
  storagePath: 'workspaces/ws-1/files/f_1/v1/doc.pdf',
  createdBy: actor,
};

describe('canonical File model', () => {
  it('creates a file with defaults', () => {
    const f = createFile(baseFile);
    expect(f.status).toBe(FILE_STATUSES.ACTIVE);
    expect(f.source).toBe(FILE_SOURCES.USER_UPLOAD);
    expect(f.currentVersion).toBe(1);
    expect(f.displayName).toBe('doc.pdf');
    expect(f.checksum).toBe(null);
    expect(Object.isFrozen(f)).toBe(true);
  });

  it('requires identity, workspace, name, mime, size, path, actor', () => {
    for (const key of ['fileId', 'workspaceId', 'name', 'mimeType', 'storagePath', 'createdBy']) {
      expect(() => createFile({ ...baseFile, [key]: undefined })).toThrow();
    }
    expect(() => createFile({ ...baseFile, size: -1 })).toThrow();
    expect(() => createFile({ ...baseFile, size: '1' })).toThrow();
  });

  it('restricts lifecycle and provenance to closed vocabularies', () => {
    expect(() => createFile({ ...baseFile, status: 'UPLOADING' })).toThrow();
    expect(() => createFile({ ...baseFile, source: 'ALIEN' })).toThrow();
    expect(CLIENT_CLAIMABLE_FILE_SOURCES).toEqual(['USER_UPLOAD']);
  });
});

describe('canonical FileVersion model', () => {
  const base = { fileVersionId: 'v1', fileId: 'f_1', workspaceId: 'ws-1', version: 1, name: 'doc.pdf', mimeType: 'application/pdf', size: 10, storagePath: 'p', createdBy: actor };
  it('creates immutable version docs', () => {
    const v = createFileVersion(base);
    expect(v.version).toBe(1);
    expect(Object.isFrozen(v)).toBe(true);
    expect(fileVersionDocId(3)).toBe('v3');
  });
  it('rejects invalid version numbers', () => {
    expect(() => createFileVersion({ ...base, version: 0 })).toThrow();
    expect(() => createFileVersion({ ...base, version: 1.5 })).toThrow();
  });
});

describe('canonical FileAttachment model', () => {
  const base = { attachmentId: 'att_1', workspaceId: 'ws-1', fileId: 'f_1', fileVersion: 1, targetType: 'RECORD', targetId: 'rec-1', attachedBy: actor };
  it('creates attachments over closed target types', () => {
    const att = createFileAttachment(base);
    expect(att.status).toBe('ACTIVE');
    expect(ATTACHMENT_TARGET_TYPES.RECORD).toBe('RECORD');
    expect(ATTACHMENT_TARGET_TYPES.ENTITY).toBe('ENTITY');
  });
  it('rejects reserved/unknown target types', () => {
    for (const t of RESERVED_ATTACHMENT_TARGET_TYPES) {
      expect(() => createFileAttachment({ ...base, targetType: t })).toThrow();
    }
    expect(() => createFileAttachment({ ...base, targetType: 'ARBITRARY_COLLECTION' })).toThrow();
  });
  it('pins the version attached at', () => {
    expect(() => createFileAttachment({ ...base, fileVersion: 0 })).toThrow();
    expect(createFileAttachment({ ...base, fileVersion: 5 }).fileVersion).toBe(5);
  });
});
