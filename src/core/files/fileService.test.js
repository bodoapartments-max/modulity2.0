import { describe, it, expect, vi } from 'vitest';
import { createFileService } from './fileService.js';

function repos({ file = null, attachment = null, versions = [], attachments = [] } = {}) {
  return {
    fileRepo: {
      getById: vi.fn(async (wsId, fileId) => (file && fileId === file.fileId ? file : null)),
      listByWorkspace: vi.fn(async () => (file ? [file] : [])),
    },
    fileVersionRepo: {
      getVersion: vi.fn(async () => versions[0] || null),
      listVersions: vi.fn(async () => versions),
    },
    fileAttachmentRepo: {
      getById: vi.fn(async () => attachment),
      listActiveByTarget: vi.fn(async () => attachments),
      listByFile: vi.fn(async () => attachments),
    },
  };
}

const file = { fileId: 'f_1', workspaceId: 'ws-1', name: 'a.pdf', status: 'ACTIVE' };
const attachment = { attachmentId: 'att_1', workspaceId: 'ws-1', fileId: 'f_1', targetType: 'RECORD', targetId: 'r1', status: 'ACTIVE' };

describe('fileService — read boundary', () => {
  it('returns files belonging to the workspace', async () => {
    const svc = createFileService(repos({ file }));
    expect((await svc.getFile('ws-1', 'f_1')).fileId).toBe('f_1');
  });

  it('throws not_found for missing or cross-workspace files', async () => {
    const svc = createFileService(repos({ file: { ...file, workspaceId: 'ws-2' } }));
    await expect(svc.getFile('ws-1', 'f_1')).rejects.toThrow();
    const svc2 = createFileService(repos({}));
    await expect(svc2.getFile('ws-1', 'ghost')).rejects.toThrow();
  });

  it('resolves active attachments joined with file metadata', async () => {
    const svc = createFileService(repos({ file, attachments: [attachment, { ...attachment, attachmentId: 'att_2', fileId: 'missing' }] }));
    const result = await svc.listAttachmentsForTarget('ws-1', 'RECORD', 'r1');
    expect(result.length).toBe(1);
    expect(result[0].attachment.attachmentId).toBe('att_1');
    expect(result[0].file.fileId).toBe('f_1');
  });

  it('lists versions and attachments for a file', async () => {
    const svc = createFileService(repos({ file, attachment, attachments: [attachment], versions: [{ version: 1 }] }));
    expect(await svc.listFileVersions('ws-1', 'f_1')).toHaveLength(1);
    expect(await svc.listAttachmentsForFile('ws-1', 'f_1')).toHaveLength(1);
    expect((await svc.getAttachment('ws-1', 'att_1')).attachmentId).toBe('att_1');
  });
});
