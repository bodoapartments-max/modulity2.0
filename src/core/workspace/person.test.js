import { describe, it, expect } from 'vitest';
import { createPerson } from './person.js';

const base = { userId: 'user-1', displayName: 'Jane Doe', email: 'Jane@Example.com' };

describe('createPerson', () => {
  it('creates a frozen person with correct fields', () => {
    const p = createPerson(base);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.userId).toBe('user-1');
    expect(p.displayName).toBe('Jane Doe');
    expect(p.createdAt).toBeTruthy();
    expect(p.updatedAt).toBeTruthy();
  });

  it('throws when userId is missing', () => {
    expect(() => createPerson({ ...base, userId: undefined })).toThrow(/userId/);
  });

  it('throws when displayName is empty', () => {
    expect(() => createPerson({ ...base, displayName: '  ' })).toThrow(/displayName is required/);
  });

  it('throws when email is empty', () => {
    expect(() => createPerson({ ...base, email: '' })).toThrow(/email is required/);
  });

  it('sets email to lowercase', () => {
    expect(createPerson(base).email).toBe('jane@example.com');
  });

  it('defaults phone and avatarUrl to empty string', () => {
    const p = createPerson(base);
    expect(p.phone).toBe('');
    expect(p.avatarUrl).toBe('');
  });
});
