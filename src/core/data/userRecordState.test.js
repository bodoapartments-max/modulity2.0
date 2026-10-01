import { describe, it, expect } from 'vitest';
import { createUserRecordState, userRecordStateId } from './userRecordState.js';

describe('userRecordState', () => {
  it('creates composite ID correctly', () => {
    expect(userRecordStateId('user-1', 'rec-1')).toBe('user-1_rec-1');
  });

  it('rejects missing userId in stateId', () => {
    expect(() => userRecordStateId('', 'rec-1')).toThrow('userId and recordId are required');
  });

  it('rejects missing recordId in stateId', () => {
    expect(() => userRecordStateId('user-1', '')).toThrow('userId and recordId are required');
  });

  it('creates a valid user record state', () => {
    const s = createUserRecordState({
      workspaceId: 'ws-1',
      userId: 'user-1',
      recordId: 'rec-1',
    });
    expect(s.stateId).toBe('user-1_rec-1');
    expect(s.starred).toBe(false);
  });

  it('accepts starred flag', () => {
    const s = createUserRecordState({
      workspaceId: 'ws-1',
      userId: 'user-1',
      recordId: 'rec-1',
      starred: true,
    });
    expect(s.starred).toBe(true);
  });

  it('rejects missing workspaceId', () => {
    expect(() => createUserRecordState({ workspaceId: '', userId: 'u', recordId: 'r' }))
      .toThrow('workspaceId is required');
  });

  it('rejects missing userId', () => {
    expect(() => createUserRecordState({ workspaceId: 'ws', userId: '', recordId: 'r' }))
      .toThrow('userId is required');
  });

  it('rejects missing recordId', () => {
    expect(() => createUserRecordState({ workspaceId: 'ws', userId: 'u', recordId: '' }))
      .toThrow('recordId is required');
  });

  it('freezes the result', () => {
    const s = createUserRecordState({
      workspaceId: 'ws-1',
      userId: 'user-1',
      recordId: 'rec-1',
    });
    expect(Object.isFrozen(s)).toBe(true);
  });
});
