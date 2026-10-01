import { describe, it, expect } from 'vitest';
import { createInvitation, isExpired, INVITATION_STATUSES } from './invitation.js';

const base = {
  invitationId: 'inv-1',
  organizationId: 'org-1',
  email: 'Jane@Example.com',
  role: 'MEMBER',
  invitedByUserId: 'user-1',
};

describe('createInvitation', () => {
  it('creates a frozen invitation with correct fields', () => {
    const inv = createInvitation(base);
    expect(Object.isFrozen(inv)).toBe(true);
    expect(inv.invitationId).toBe('inv-1');
    expect(inv.organizationId).toBe('org-1');
    expect(inv.role).toBe('MEMBER');
    expect(inv.invitedByUserId).toBe('user-1');
    expect(inv.acceptedAt).toBeNull();
    expect(inv.expiresAt).toBeTruthy();
  });

  it('defaults status to PENDING', () => {
    expect(createInvitation(base).status).toBe(INVITATION_STATUSES.PENDING);
  });

  it('sets email to lowercase', () => {
    expect(createInvitation(base).email).toBe('jane@example.com');
  });

  it('throws when invitationId is missing', () => {
    expect(() => createInvitation({ ...base, invitationId: undefined })).toThrow(/invitationId/);
  });

  it('throws when email is empty', () => {
    expect(() => createInvitation({ ...base, email: '  ' })).toThrow(/Email is required/);
  });
});

describe('isExpired', () => {
  it('returns true for past expiresAt', () => {
    const inv = createInvitation({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(isExpired(inv)).toBe(true);
  });

  it('returns false for future expiresAt', () => {
    const inv = createInvitation({ ...base, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(isExpired(inv)).toBe(false);
  });
});
