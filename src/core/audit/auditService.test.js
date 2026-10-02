import { describe, it, expect, vi } from 'vitest';
import { createAuditService } from './auditService.js';

function mockRepo() {
  return {
    create: vi.fn(async (entry) => entry),
    paginatedQuery: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
  };
}

describe('auditService', () => {
  it('records an audit entry', async () => {
    const repo = mockRepo();
    const svc = createAuditService({ auditEntryRepo: repo });
    const result = await svc.record({
      workspaceId: 'ws-1',
      actor: { actorType: 'USER', actorId: 'u1' },
      action: 'record.created',
      resourceType: 'RECORD',
      resourceId: 'rec-1',
    });
    expect(repo.create).toHaveBeenCalledOnce();
    expect(result.action).toBe('record.created');
    expect(result.resourceId).toBe('rec-1');
  });

  it('auto-generates correlationId when not provided', async () => {
    const repo = mockRepo();
    const svc = createAuditService({ auditEntryRepo: repo });
    const result = await svc.record({
      workspaceId: 'ws-1',
      actor: { actorType: 'USER', actorId: 'u1' },
      action: 'record.submitted',
      resourceType: 'RECORD',
      resourceId: 'rec-1',
    });
    expect(result.correlationId).toBeTruthy();
    expect(result.correlationId.startsWith('corr:')).toBe(true);
  });

  it('preserves provided correlationId', async () => {
    const repo = mockRepo();
    const svc = createAuditService({ auditEntryRepo: repo });
    const result = await svc.record({
      workspaceId: 'ws-1',
      actor: { actorType: 'USER', actorId: 'u1' },
      action: 'record.created',
      resourceType: 'RECORD',
      resourceId: 'rec-1',
      correlationId: 'custom-corr',
    });
    expect(result.correlationId).toBe('custom-corr');
  });

  it('queries resource history', async () => {
    const repo = mockRepo();
    const svc = createAuditService({ auditEntryRepo: repo });
    await svc.getResourceHistory('ws-1', 'RECORD', 'rec-1');
    expect(repo.paginatedQuery).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      resourceType: 'RECORD',
      resourceId: 'rec-1',
      sortDirection: 'desc',
    }));
  });

  it('queries actor history', async () => {
    const repo = mockRepo();
    const svc = createAuditService({ auditEntryRepo: repo });
    await svc.getActorHistory('ws-1', 'u1');
    expect(repo.paginatedQuery).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      actorId: 'u1',
    }));
  });
});
