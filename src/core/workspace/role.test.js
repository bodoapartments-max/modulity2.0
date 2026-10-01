import { describe, it, expect } from 'vitest';
import { hasCapability, getCapabilities, getHighestRole } from './role.js';
import { SYSTEM_ROLES } from './membership.js';

describe('hasCapability', () => {
  it('OWNER has all capabilities including ownership.transfer and members.change_role', () => {
    const roles = [SYSTEM_ROLES.OWNER];
    expect(hasCapability(roles, 'ownership.transfer')).toBe(true);
    expect(hasCapability(roles, 'members.change_role')).toBe(true);
    expect(hasCapability(roles, 'groups.create')).toBe(true);
    expect(hasCapability(roles, 'workspace.view')).toBe(true);
  });

  it('ADMIN has groups.create but not ownership.transfer', () => {
    const roles = [SYSTEM_ROLES.ADMIN];
    expect(hasCapability(roles, 'groups.create')).toBe(true);
    expect(hasCapability(roles, 'ownership.transfer')).toBe(false);
  });

  it('MEMBER has workspace.view but not groups.create', () => {
    const roles = [SYSTEM_ROLES.MEMBER];
    expect(hasCapability(roles, 'workspace.view')).toBe(true);
    expect(hasCapability(roles, 'groups.create')).toBe(false);
  });

  it('multiple roles merge capabilities', () => {
    const caps = getCapabilities([SYSTEM_ROLES.MEMBER, SYSTEM_ROLES.ADMIN]);
    expect(caps).toContain('workspace.view');
    expect(caps).toContain('groups.create');
  });
});

describe('getHighestRole', () => {
  it('returns OWNER when roles include OWNER', () => {
    expect(getHighestRole([SYSTEM_ROLES.MEMBER, SYSTEM_ROLES.OWNER])).toBe(SYSTEM_ROLES.OWNER);
  });

  it('returns ADMIN when roles include ADMIN but not OWNER', () => {
    expect(getHighestRole([SYSTEM_ROLES.MEMBER, SYSTEM_ROLES.ADMIN])).toBe(SYSTEM_ROLES.ADMIN);
  });

  it('returns MEMBER for just MEMBER', () => {
    expect(getHighestRole([SYSTEM_ROLES.MEMBER])).toBe(SYSTEM_ROLES.MEMBER);
  });
});
