import { describe, it, expect } from 'vitest';
import { createFolder, createFolderItem, FOLDER_SCOPES } from './folder.js';

describe('folder', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    folderId: 'folder-1',
    workspaceId: 'ws-1',
    name: 'Important',
    createdBy: actorRef,
  };

  it('creates a valid user folder', () => {
    const f = createFolder({ ...baseArgs, ownerUserId: 'user-1' });
    expect(f.folderId).toBe('folder-1');
    expect(f.name).toBe('Important');
    expect(f.scope).toBe(FOLDER_SCOPES.USER);
  });

  it('rejects missing folderId', () => {
    expect(() => createFolder({ ...baseArgs, folderId: '', ownerUserId: 'u1' })).toThrow('folderId is required');
  });

  it('rejects missing name', () => {
    expect(() => createFolder({ ...baseArgs, name: '', ownerUserId: 'u1' })).toThrow('Folder name is required');
  });

  it('rejects missing name (whitespace only)', () => {
    expect(() => createFolder({ ...baseArgs, name: '   ', ownerUserId: 'u1' })).toThrow('Folder name is required');
  });

  it('rejects missing createdBy', () => {
    expect(() => createFolder({ ...baseArgs, createdBy: null, ownerUserId: 'u1' })).toThrow('createdBy is required');
  });

  it('rejects USER scope without ownerUserId', () => {
    expect(() => createFolder({ ...baseArgs, scope: FOLDER_SCOPES.USER })).toThrow('ownerUserId is required');
  });

  it('accepts WORKSPACE scope without ownerUserId', () => {
    const f = createFolder({ ...baseArgs, scope: FOLDER_SCOPES.WORKSPACE });
    expect(f.scope).toBe('WORKSPACE');
    expect(f.ownerUserId).toBeNull();
  });

  it('rejects invalid scope', () => {
    expect(() => createFolder({ ...baseArgs, scope: 'INVALID' })).toThrow('Invalid folder scope');
  });

  it('trims folder name', () => {
    const f = createFolder({ ...baseArgs, ownerUserId: 'u1', name: '  My Folder  ' });
    expect(f.name).toBe('My Folder');
  });

  it('freezes the result', () => {
    const f = createFolder({ ...baseArgs, ownerUserId: 'u1' });
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.createdBy)).toBe(true);
  });
});

describe('folderItem', () => {
  it('creates a valid folder item', () => {
    const item = createFolderItem({
      itemId: 'item-1',
      folderId: 'folder-1',
      recordId: 'rec-1',
      addedBy: 'user-1',
    });
    expect(item.itemId).toBe('item-1');
    expect(item.recordId).toBe('rec-1');
  });

  it('rejects missing fields', () => {
    expect(() => createFolderItem({ itemId: '', folderId: 'f', recordId: 'r', addedBy: 'u' })).toThrow('itemId is required');
    expect(() => createFolderItem({ itemId: 'i', folderId: '', recordId: 'r', addedBy: 'u' })).toThrow('folderId is required');
    expect(() => createFolderItem({ itemId: 'i', folderId: 'f', recordId: '', addedBy: 'u' })).toThrow('recordId is required');
    expect(() => createFolderItem({ itemId: 'i', folderId: 'f', recordId: 'r', addedBy: '' })).toThrow('addedBy is required');
  });

  it('freezes the result', () => {
    const item = createFolderItem({
      itemId: 'item-1',
      folderId: 'folder-1',
      recordId: 'rec-1',
      addedBy: 'user-1',
    });
    expect(Object.isFrozen(item)).toBe(true);
  });
});
