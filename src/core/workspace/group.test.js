import { describe, it, expect } from 'vitest';
import { createGroup } from './group.js';

const base = { groupId: 'grp-1', organizationId: 'org-1', name: 'Management' };

describe('createGroup', () => {
  it('creates a frozen group with correct fields', () => {
    const g = createGroup(base);
    expect(Object.isFrozen(g)).toBe(true);
    expect(g.groupId).toBe('grp-1');
    expect(g.organizationId).toBe('org-1');
    expect(g.name).toBe('Management');
    expect(g.description).toBe('');
    expect(g.createdAt).toBeTruthy();
  });

  it('throws when groupId is missing', () => {
    expect(() => createGroup({ ...base, groupId: undefined })).toThrow(/groupId/);
  });

  it('throws when organizationId is missing', () => {
    expect(() => createGroup({ ...base, organizationId: undefined })).toThrow(/organizationId/);
  });

  it('throws when name is empty', () => {
    expect(() => createGroup({ ...base, name: '   ' })).toThrow(/Group name is required/);
  });

  it('trims name and description', () => {
    const g = createGroup({ ...base, name: '  Reception ', description: ' Front desk ' });
    expect(g.name).toBe('Reception');
    expect(g.description).toBe('Front desk');
  });
});
