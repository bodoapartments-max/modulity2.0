import { describe, it, expect } from 'vitest';
import { createWorkspace, WORKSPACE_TYPES } from './workspace.js';

const base = {
  workspaceId: 'ws-1',
  type: WORKSPACE_TYPES.PERSONAL,
  name: 'My Workspace',
  ownerUserId: 'user-1',
};

describe('createWorkspace', () => {
  it('creates a frozen PERSONAL workspace with correct fields', () => {
    const ws = createWorkspace(base);
    expect(Object.isFrozen(ws)).toBe(true);
    expect(ws.workspaceId).toBe('ws-1');
    expect(ws.type).toBe(WORKSPACE_TYPES.PERSONAL);
    expect(ws.name).toBe('My Workspace');
    expect(ws.ownerUserId).toBe('user-1');
    expect(ws.organizationId).toBeNull();
    expect(ws.createdAt).toBeTruthy();
    expect(ws.updatedAt).toBeTruthy();
  });

  it('creates a valid ORGANIZATION workspace', () => {
    const ws = createWorkspace({ ...base, type: WORKSPACE_TYPES.ORGANIZATION, organizationId: 'org-1' });
    expect(ws.type).toBe(WORKSPACE_TYPES.ORGANIZATION);
    expect(ws.organizationId).toBe('org-1');
  });

  it('throws when workspaceId is missing', () => {
    expect(() => createWorkspace({ ...base, workspaceId: undefined })).toThrow(/workspaceId/);
  });

  it('throws for invalid workspace type', () => {
    expect(() => createWorkspace({ ...base, type: 'INVALID' })).toThrow(/Invalid workspace type/);
  });

  it('throws when name is empty', () => {
    expect(() => createWorkspace({ ...base, name: '   ' })).toThrow(/name is required/i);
  });

  it('throws when ownerUserId is missing', () => {
    expect(() => createWorkspace({ ...base, ownerUserId: undefined })).toThrow(/ownerUserId/);
  });

  it('trims name whitespace', () => {
    const ws = createWorkspace({ ...base, name: '  Padded  ' });
    expect(ws.name).toBe('Padded');
  });
});
