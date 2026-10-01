import { describe, it, expect } from 'vitest';
import { toUserIdentity, UserIdentity, SignUpRequest, SignInRequest } from './user.js';

describe('toUserIdentity', () => {
  it('maps a Firebase-like user to a frozen UserIdentity', () => {
    const providerUser = {
      uid: 'uid-123',
      email: 'alice@example.com',
      displayName: 'Alice',
      emailVerified: true,
    };

    const user = toUserIdentity(providerUser);

    expect(user).toBeInstanceOf(UserIdentity);
    expect(user.userId).toBe('uid-123');
    expect(user.email).toBe('alice@example.com');
    expect(user.displayName).toBe('Alice');
    expect(user.emailVerified).toBe(true);
    expect(Object.isFrozen(user)).toBe(true);
  });

  it('returns null for a null provider user', () => {
    expect(toUserIdentity(null)).toBeNull();
  });

  it('normalizes missing optional fields', () => {
    const user = toUserIdentity({
      uid: 'uid-456',
      email: null,
      displayName: null,
      emailVerified: false,
    });

    expect(user.email).toBe('');
    expect(user.displayName).toBe('');
  });
});

describe('SignUpRequest', () => {
  it('stores request fields and is frozen', () => {
    const request = new SignUpRequest({
      email: 'alice@example.com',
      password: 'secret',
      displayName: 'Alice',
    });

    expect(request.email).toBe('alice@example.com');
    expect(request.password).toBe('secret');
    expect(request.displayName).toBe('Alice');
    expect(Object.isFrozen(request)).toBe(true);
  });
});

describe('SignInRequest', () => {
  it('stores request fields and is frozen', () => {
    const request = new SignInRequest({
      email: 'alice@example.com',
      password: 'secret',
    });

    expect(request.email).toBe('alice@example.com');
    expect(request.password).toBe('secret');
    expect(Object.isFrozen(request)).toBe(true);
  });
});
