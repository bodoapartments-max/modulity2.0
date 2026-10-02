import { describe, it, expect } from 'vitest';
import { createAuditEntry } from './auditEntry.js';

const base = {
  auditEntryId: 'ae-1',
  workspaceId: 'ws-1',
  actor: { actorType: 'USER', actorId: 'u1' },
  action: 'record.created',
  resourceType: 'RECORD',
  resourceId: 'rec-1',
};

describe('createAuditEntry', () => {
  it('creates a valid entry with defaults', () => {
    const e = createAuditEntry(base);
    expect(e.auditEntryId).toBe('ae-1');
    expect(e.source).toBe('web');
    expect(e.correlationId).toBeNull();
    expect(e.sourceRequestId).toBeNull();
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.actor)).toBe(true);
    expect(Object.isFrozen(e.metadata)).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(() => createAuditEntry({ ...base, auditEntryId: '' })).toThrow('auditEntryId');
    expect(() => createAuditEntry({ ...base, workspaceId: '' })).toThrow('workspaceId');
    expect(() => createAuditEntry({ ...base, actor: null })).toThrow('actor');
    expect(() => createAuditEntry({ ...base, action: '' })).toThrow('action');
    expect(() => createAuditEntry({ ...base, resourceType: '' })).toThrow('resourceType');
    expect(() => createAuditEntry({ ...base, resourceId: '' })).toThrow('resourceId');
  });

  it('rejects invalid action', () => {
    expect(() => createAuditEntry({ ...base, action: 'invalid.action' })).toThrow('Invalid audit action');
  });

  it('rejects invalid resource type', () => {
    expect(() => createAuditEntry({ ...base, resourceType: 'INVALID' })).toThrow('Invalid audit resource type');
  });

  it('rejects invalid source', () => {
    expect(() => createAuditEntry({ ...base, source: 'invalid' })).toThrow('Invalid audit source');
  });

  it('rejects actor without actorType/actorId', () => {
    expect(() => createAuditEntry({ ...base, actor: { actorType: 'USER' } })).toThrow('actor must have');
    expect(() => createAuditEntry({ ...base, actor: { actorId: 'u1' } })).toThrow('actor must have');
  });

  it('accepts metadata', () => {
    const e = createAuditEntry({ ...base, metadata: { oldStatus: 'DRAFT', newStatus: 'SUBMITTED' } });
    expect(e.metadata.oldStatus).toBe('DRAFT');
    expect(e.metadata.newStatus).toBe('SUBMITTED');
  });

  it('accepts correlationId', () => {
    const e = createAuditEntry({ ...base, correlationId: 'corr-1' });
    expect(e.correlationId).toBe('corr-1');
  });

  it('accepts all valid actions', () => {
    const actions = [
      'record.created', 'record.submitted', 'record.archived',
      'ledger.book_created', 'ledger.entry_registered',
      'module.created', 'entity.created',
    ];
    for (const action of actions) {
      expect(createAuditEntry({ ...base, action }).action).toBe(action);
    }
  });

  it('accepts all valid resource types', () => {
    const types = ['RECORD', 'FORM_REQUEST', 'DELIVERY', 'LEDGER_BOOK', 'LEDGER_ENTRY', 'MODULE', 'ENTITY', 'ENTITY_TYPE'];
    for (const resourceType of types) {
      expect(createAuditEntry({ ...base, resourceType }).resourceType).toBe(resourceType);
    }
  });
});
