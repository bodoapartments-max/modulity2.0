import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecordQueryService } from './recordQueryService.js';

describe('recordQueryService', () => {
  let service;
  let recordRepo;
  let deliveryRepo;
  let userRecordStateRepo;

  beforeEach(() => {
    recordRepo = {
      getById: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      paginatedQuery: vi.fn().mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    };
    deliveryRepo = {
      listBySender: vi.fn().mockResolvedValue([]),
      listByRecipient: vi.fn().mockResolvedValue([]),
    };
    userRecordStateRepo = {
      getStarredRecordIds: vi.fn().mockResolvedValue([]),
    };
    service = createRecordQueryService({ recordRepo, deliveryRepo, userRecordStateRepo });
  });

  it('uses paginatedQuery for ALL bucket', async () => {
    await service.queryRecords({ workspaceId: 'ws-1' });
    expect(recordRepo.paginatedQuery).toHaveBeenCalled();
  });

  it('STARRED bucket requires userId', async () => {
    await expect(service.queryRecords({ workspaceId: 'ws-1', bucket: 'STARRED' }))
      .rejects.toThrow('userId is required');
  });

  it('SENT bucket requires userId', async () => {
    await expect(service.queryRecords({ workspaceId: 'ws-1', bucket: 'SENT' }))
      .rejects.toThrow('userId is required');
  });

  it('RECEIVED bucket requires userId', async () => {
    await expect(service.queryRecords({ workspaceId: 'ws-1', bucket: 'RECEIVED' }))
      .rejects.toThrow('userId is required');
  });

  it('STARRED bucket queries userRecordStateRepo', async () => {
    userRecordStateRepo.getStarredRecordIds.mockResolvedValue(['rec-1']);
    recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE', createdAt: '2025-01-01' });

    const result = await service.queryRecords({ workspaceId: 'ws-1', bucket: 'STARRED', userId: 'user-1' });
    expect(userRecordStateRepo.getStarredRecordIds).toHaveBeenCalledWith('ws-1', 'user-1');
    expect(result.items).toHaveLength(1);
  });

  it('SENT bucket queries deliveryRepo.listBySender', async () => {
    deliveryRepo.listBySender.mockResolvedValue([{ deliveryId: 'd-1', recordId: 'rec-1' }]);
    recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE', createdAt: '2025-01-01' });

    const result = await service.queryRecords({ workspaceId: 'ws-1', bucket: 'SENT', userId: 'user-1' });
    expect(deliveryRepo.listBySender).toHaveBeenCalledWith('ws-1', 'user-1');
    expect(result.items).toHaveLength(1);
  });

  it('RECEIVED bucket queries deliveryRepo.listByRecipient', async () => {
    deliveryRepo.listByRecipient.mockResolvedValue([{ deliveryId: 'd-1', recordId: 'rec-1' }]);
    recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE', createdAt: '2025-01-01' });

    const result = await service.queryRecords({ workspaceId: 'ws-1', bucket: 'RECEIVED', userId: 'user-1' });
    expect(deliveryRepo.listByRecipient).toHaveBeenCalledWith('ws-1', 'user-1');
    expect(result.items).toHaveLength(1);
  });

  it('SENT bucket deduplicates recordIds', async () => {
    deliveryRepo.listBySender.mockResolvedValue([
      { deliveryId: 'd-1', recordId: 'rec-1' },
      { deliveryId: 'd-2', recordId: 'rec-1' },
    ]);
    recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE', createdAt: '2025-01-01' });

    const result = await service.queryRecords({ workspaceId: 'ws-1', bucket: 'SENT', userId: 'user-1' });
    expect(recordRepo.getById).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
  });

  it('returns empty result when no starred records', async () => {
    const result = await service.queryRecords({ workspaceId: 'ws-1', bucket: 'STARRED', userId: 'user-1' });
    expect(result.items).toHaveLength(0);
  });

  it('filters collaboration bucket results by date range', async () => {
    userRecordStateRepo.getStarredRecordIds.mockResolvedValue(['rec-1', 'rec-2']);
    recordRepo.getById.mockImplementation((ws, id) => {
      if (id === 'rec-1') return { recordId: 'rec-1', status: 'ACTIVE', createdAt: '2025-01-15T00:00:00Z' };
      if (id === 'rec-2') return { recordId: 'rec-2', status: 'ACTIVE', createdAt: '2024-06-01T00:00:00Z' };
      return null;
    });

    const result = await service.queryRecords({
      workspaceId: 'ws-1',
      bucket: 'STARRED',
      userId: 'user-1',
      createdFrom: '2025-01-01T00:00:00Z',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].recordId).toBe('rec-1');
  });
});
