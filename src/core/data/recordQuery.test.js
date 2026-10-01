import { describe, it, expect } from 'vitest';
import { createRecordQuery, RECORD_BUCKETS, SORT_FIELDS, SORT_DIRECTIONS, createPaginatedResult } from './recordQuery.js';

describe('recordQuery', () => {
  const base = { workspaceId: 'ws-1' };

  it('creates a valid query with defaults', () => {
    const q = createRecordQuery(base);
    expect(q.workspaceId).toBe('ws-1');
    expect(q.bucket).toBe(RECORD_BUCKETS.ALL);
    expect(q.sortField).toBe(SORT_FIELDS.CREATED_AT);
    expect(q.sortDirection).toBe(SORT_DIRECTIONS.DESC);
    expect(q.limit).toBe(25);
    expect(q.startAfter).toBeNull();
  });

  it('rejects missing workspaceId', () => {
    expect(() => createRecordQuery({})).toThrow('workspaceId is required');
  });

  it('rejects invalid bucket', () => {
    expect(() => createRecordQuery({ ...base, bucket: 'UNKNOWN' })).toThrow('Invalid record bucket');
  });

  it('rejects invalid sort field', () => {
    expect(() => createRecordQuery({ ...base, sortField: 'badField' })).toThrow('Invalid sort field');
  });

  it('rejects invalid sort direction', () => {
    expect(() => createRecordQuery({ ...base, sortDirection: 'sideways' })).toThrow('Invalid sort direction');
  });

  it('clamps limit to valid range', () => {
    expect(createRecordQuery({ ...base, limit: 0 }).limit).toBe(1);
    expect(createRecordQuery({ ...base, limit: 200 }).limit).toBe(100);
    expect(createRecordQuery({ ...base, limit: 50 }).limit).toBe(50);
  });

  it('accepts all filters', () => {
    const q = createRecordQuery({
      ...base,
      userId: 'user-1',
      moduleId: 'mod-1',
      bucket: 'OWN',
      status: 'ACTIVE',
      priority: 'HIGH',
      recordType: 'invoice',
      sortField: 'updatedAt',
      sortDirection: 'ASC',
      startAfter: 'cursor-token',
      limit: 10,
    });
    expect(q.userId).toBe('user-1');
    expect(q.moduleId).toBe('mod-1');
    expect(q.bucket).toBe('OWN');
    expect(q.status).toBe('ACTIVE');
    expect(q.priority).toBe('HIGH');
    expect(q.recordType).toBe('invoice');
    expect(q.sortField).toBe('updatedAt');
    expect(q.sortDirection).toBe('ASC');
    expect(q.startAfter).toBe('cursor-token');
    expect(q.limit).toBe(10);
  });

  it('returns frozen result', () => {
    const q = createRecordQuery(base);
    expect(Object.isFrozen(q)).toBe(true);
  });

  it('accepts createdFrom and createdTo', () => {
    const q = createRecordQuery({
      ...base,
      createdFrom: '2025-01-01T00:00:00Z',
      createdTo: '2025-12-31T23:59:59Z',
    });
    expect(q.createdFrom).toBe('2025-01-01T00:00:00Z');
    expect(q.createdTo).toBe('2025-12-31T23:59:59Z');
  });

  it('defaults createdFrom and createdTo to null', () => {
    const q = createRecordQuery(base);
    expect(q.createdFrom).toBeNull();
    expect(q.createdTo).toBeNull();
  });

  it('normalizes ARCHIVED bucket to force status ARCHIVED', () => {
    const q = createRecordQuery({ ...base, bucket: 'ARCHIVED', status: 'ACTIVE' });
    expect(q.bucket).toBe('ARCHIVED');
    expect(q.status).toBe('ARCHIVED');
  });

  it('ARCHIVED bucket without explicit status still sets status to ARCHIVED', () => {
    const q = createRecordQuery({ ...base, bucket: 'ARCHIVED' });
    expect(q.status).toBe('ARCHIVED');
  });

  it('non-ARCHIVED bucket preserves original status filter', () => {
    const q = createRecordQuery({ ...base, bucket: 'ALL', status: 'SUBMITTED' });
    expect(q.status).toBe('SUBMITTED');
  });
});

describe('createPaginatedResult', () => {
  it('creates a paginated result', () => {
    const result = createPaginatedResult([{ id: 1 }], 'cursor', true);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('cursor');
    expect(result.hasMore).toBe(true);
  });

  it('defaults to no more results', () => {
    const result = createPaginatedResult([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns frozen result', () => {
    const result = createPaginatedResult([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });
});
