import { describe, it, expect } from 'vitest';
import { createDelivery, DELIVERY_STATUSES, DELIVERY_TYPES, validateDeliveryTransition } from './delivery.js';

describe('delivery', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    deliveryId: 'del-1',
    workspaceId: 'ws-1',
    recordId: 'rec-1',
    sender: actorRef,
    recipientUserId: 'user-2',
  };

  it('creates a valid delivery', () => {
    const d = createDelivery(baseArgs);
    expect(d.deliveryId).toBe('del-1');
    expect(d.recordId).toBe('rec-1');
    expect(d.status).toBe(DELIVERY_STATUSES.PENDING);
    expect(d.deliveryType).toBe(DELIVERY_TYPES.SHARE);
  });

  it('rejects missing deliveryId', () => {
    expect(() => createDelivery({ ...baseArgs, deliveryId: '' })).toThrow('deliveryId is required');
  });

  it('rejects missing workspaceId', () => {
    expect(() => createDelivery({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects missing recordId', () => {
    expect(() => createDelivery({ ...baseArgs, recordId: '' })).toThrow('recordId is required');
  });

  it('rejects missing sender', () => {
    expect(() => createDelivery({ ...baseArgs, sender: null })).toThrow('sender is required');
  });

  it('rejects missing recipientUserId', () => {
    expect(() => createDelivery({ ...baseArgs, recipientUserId: '' })).toThrow('recipientUserId is required');
  });

  it('rejects invalid delivery type', () => {
    expect(() => createDelivery({ ...baseArgs, deliveryType: 'INVALID' })).toThrow('Invalid delivery type');
  });

  it('rejects invalid status', () => {
    expect(() => createDelivery({ ...baseArgs, status: 'INVALID' })).toThrow('Invalid delivery status');
  });

  it('freezes the result', () => {
    const d = createDelivery(baseArgs);
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.sender)).toBe(true);
  });

  it('accepts ASSIGNMENT delivery type', () => {
    const d = createDelivery({ ...baseArgs, deliveryType: DELIVERY_TYPES.ASSIGNMENT });
    expect(d.deliveryType).toBe('ASSIGNMENT');
  });
});

describe('validateDeliveryTransition', () => {
  it('allows PENDING -> DELIVERED', () => {
    const result = validateDeliveryTransition('PENDING', 'DELIVERED');
    expect(result.valid).toBe(true);
  });

  it('allows PENDING -> REVOKED', () => {
    const result = validateDeliveryTransition('PENDING', 'REVOKED');
    expect(result.valid).toBe(true);
  });

  it('rejects PENDING -> COMPLETED', () => {
    const result = validateDeliveryTransition('PENDING', 'COMPLETED');
    expect(result.valid).toBe(false);
  });

  it('rejects transitions from COMPLETED', () => {
    const result = validateDeliveryTransition('COMPLETED', 'PENDING');
    expect(result.valid).toBe(false);
  });

  it('rejects transitions from REVOKED', () => {
    const result = validateDeliveryTransition('REVOKED', 'PENDING');
    expect(result.valid).toBe(false);
  });

  it('rejects invalid current status', () => {
    const result = validateDeliveryTransition('INVALID', 'PENDING');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid current status');
  });

  it('rejects invalid target status', () => {
    const result = validateDeliveryTransition('PENDING', 'INVALID');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid target status');
  });
});
