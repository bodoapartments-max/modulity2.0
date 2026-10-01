import { describe, it, expect } from 'vitest';
import { createRecord, RECORD_STATUSES } from './record.js';

describe('record', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    recordId: 'record-1',
    workspaceId: 'ws-1',
    recordType: 'work-order',
    createdBy: actorRef,
  };

  it('creates a valid record', () => {
    const record = createRecord(baseArgs);
    expect(record.recordId).toBe('record-1');
    expect(record.recordType).toBe('work-order');
    expect(record.createdBy).toEqual(actorRef);
  });

  it('defaults status to DRAFT', () => {
    const record = createRecord(baseArgs);
    expect(record.status).toBe(RECORD_STATUSES.DRAFT);
  });

  it('defaults priority to null', () => {
    const record = createRecord(baseArgs);
    expect(record.priority).toBeNull();
  });

  it('rejects a missing recordId', () => {
    expect(() => createRecord({ ...baseArgs, recordId: '' })).toThrow('recordId is required');
  });

  it('rejects a missing workspaceId', () => {
    expect(() => createRecord({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects a missing recordType', () => {
    expect(() => createRecord({ ...baseArgs, recordType: '' })).toThrow('recordType is required');
  });

  it('rejects a missing createdBy', () => {
    expect(() => createRecord({ ...baseArgs, createdBy: null })).toThrow('createdBy is required');
  });

  it('rejects an invalid status', () => {
    expect(() => createRecord({ ...baseArgs, status: 'PENDING' })).toThrow('Invalid record status: PENDING');
  });

  it('rejects an invalid priority', () => {
    expect(() => createRecord({ ...baseArgs, priority: 'URGENT' })).toThrow('Invalid record priority: URGENT');
  });

  it('accepts optional moduleId and submittedBy as null', () => {
    const record = createRecord(baseArgs);
    expect(record.moduleId).toBeNull();
    expect(record.submittedBy).toBeNull();
  });

  it('stores entity references frozen', () => {
    const entityReferences = [{ entityId: 'entity-1', entityTypeId: 'type-1', workspaceId: 'ws-1' }];
    const record = createRecord({ ...baseArgs, entityReferences });
    expect(Object.isFrozen(record.entityReferences)).toBe(true);
    expect(Object.isFrozen(record.entityReferences[0])).toBe(true);
  });

  it('returns a frozen result', () => {
    const record = createRecord(baseArgs);
    expect(Object.isFrozen(record)).toBe(true);
  });
});
