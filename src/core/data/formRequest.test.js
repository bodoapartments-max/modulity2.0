import { describe, it, expect } from 'vitest';
import { createFormRequest, FORM_REQUEST_STATUSES, validateFormRequestTransition } from './formRequest.js';

describe('formRequest', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    requestId: 'req-1',
    workspaceId: 'ws-1',
    moduleId: 'mod-1',
    moduleVersion: 3,
    requester: actorRef,
    recipientUserId: 'user-2',
  };

  it('creates a valid form request', () => {
    const fr = createFormRequest(baseArgs);
    expect(fr.requestId).toBe('req-1');
    expect(fr.moduleId).toBe('mod-1');
    expect(fr.moduleVersion).toBe(3);
    expect(fr.status).toBe(FORM_REQUEST_STATUSES.PENDING);
  });

  it('rejects missing requestId', () => {
    expect(() => createFormRequest({ ...baseArgs, requestId: '' })).toThrow('requestId is required');
  });

  it('rejects missing moduleId', () => {
    expect(() => createFormRequest({ ...baseArgs, moduleId: '' })).toThrow('moduleId is required');
  });

  it('rejects non-integer moduleVersion', () => {
    expect(() => createFormRequest({ ...baseArgs, moduleVersion: 1.5 }))
      .toThrow('moduleVersion must be a positive integer');
  });

  it('rejects zero moduleVersion', () => {
    expect(() => createFormRequest({ ...baseArgs, moduleVersion: 0 }))
      .toThrow('moduleVersion must be a positive integer');
  });

  it('rejects negative moduleVersion', () => {
    expect(() => createFormRequest({ ...baseArgs, moduleVersion: -1 }))
      .toThrow('moduleVersion must be a positive integer');
  });

  it('rejects missing requester', () => {
    expect(() => createFormRequest({ ...baseArgs, requester: null })).toThrow('requester is required');
  });

  it('rejects missing recipientUserId', () => {
    expect(() => createFormRequest({ ...baseArgs, recipientUserId: '' })).toThrow('recipientUserId is required');
  });

  it('rejects invalid status', () => {
    expect(() => createFormRequest({ ...baseArgs, status: 'INVALID' })).toThrow('Invalid form request status');
  });

  it('freezes the result', () => {
    const fr = createFormRequest(baseArgs);
    expect(Object.isFrozen(fr)).toBe(true);
    expect(Object.isFrozen(fr.requester)).toBe(true);
  });

  it('stores optional fields', () => {
    const fr = createFormRequest({
      ...baseArgs,
      message: 'Please fill this out',
      priority: 'HIGH',
      dueDate: '2025-12-31',
    });
    expect(fr.message).toBe('Please fill this out');
    expect(fr.priority).toBe('HIGH');
    expect(fr.dueDate).toBe('2025-12-31');
  });
});

describe('validateFormRequestTransition', () => {
  it('allows PENDING -> OPENED', () => {
    expect(validateFormRequestTransition('PENDING', 'OPENED').valid).toBe(true);
  });

  it('allows PENDING -> CANCELLED', () => {
    expect(validateFormRequestTransition('PENDING', 'CANCELLED').valid).toBe(true);
  });

  it('rejects PENDING -> COMPLETED', () => {
    expect(validateFormRequestTransition('PENDING', 'COMPLETED').valid).toBe(false);
  });

  it('allows IN_PROGRESS -> COMPLETED', () => {
    expect(validateFormRequestTransition('IN_PROGRESS', 'COMPLETED').valid).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    expect(validateFormRequestTransition('COMPLETED', 'PENDING').valid).toBe(false);
    expect(validateFormRequestTransition('DECLINED', 'PENDING').valid).toBe(false);
    expect(validateFormRequestTransition('CANCELLED', 'PENDING').valid).toBe(false);
    expect(validateFormRequestTransition('EXPIRED', 'PENDING').valid).toBe(false);
  });

  it('rejects invalid statuses', () => {
    const result = validateFormRequestTransition('INVALID', 'OPENED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid current status');
  });
});
