import { describe, it, expect } from 'vitest';
import { createMembership, hasRole, isActiveMember, MEMBERSHIP_STATUSES, SYSTEM_ROLES } from './membership.js';

const base = {
  membershipId: 'mem-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('createMembership', () => {
  it('creates a frozen membership with correct fields', () => {
    const m = createMembership(base);
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.roles)).toBe(true);
    expect(m.status).toBe(MEMBERSHIP_STATUSES.ACTIVE);
    expect(m.roles).toEqual([SYSTEM_ROLES.MEMBER]);
    expect(m.createdAt).toBeTruthy();
  });

  it('throws when membershipId is missing', () => {
    expect(() => createMembership({ ...base, membershipId: undefined })).toThrow(/membershipId/);
  });

  it('throws for invalid status', () => {
    expect(() => createMembership({ ...base, status: 'GHOST' })).toThrow(/Invalid membership status/);
  });

  it('throws for invalid role', () => {
    expect(() => createMembership({ ...base, roles: ['SUPERUSER'] })).toThrow(/Invalid role/);
  });

  it('throws when roles array is empty', () => {
    expect(() => createMembership({ ...base, roles: [] })).toThrow(/At least one role/);
  });
});

describe('hasRole', () => {
  const m = createMembership({ ...base, roles: [SYSTEM_ROLES.ADMIN] });

  it('returns true when role is present', () => {
    expect(hasRole(m, SYSTEM_ROLES.ADMIN)).toBe(true);
  });

  it('returns false when role is absent', () => {
    expect(hasRole(m, SYSTEM_ROLES.OWNER)).toBe(false);
  });
});

describe('isActiveMember', () => {
  it('returns true for ACTIVE status', () => {
    expect(isActiveMember(createMembership({ ...base, status: MEMBERSHIP_STATUSES.ACTIVE }))).toBe(true);
  });

  it.each([MEMBERSHIP_STATUSES.INVITED, MEMBERSHIP_STATUSES.SUSPENDED, MEMBERSHIP_STATUSES.LEFT])(
    'returns false for %s status',
    (status) => {
      expect(isActiveMember(createMembership({ ...base, status }))).toBe(false);
    },
  );
});
