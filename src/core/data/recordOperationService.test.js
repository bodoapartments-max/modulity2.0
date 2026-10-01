import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecordOperationService } from './recordOperationService.js';

describe('recordOperationService', () => {
  let service;
  let recordRepo;

  const actor = { actorType: 'USER', actorId: 'user-1' };

  beforeEach(() => {
    recordRepo = {
      getById: vi.fn(),
      update: vi.fn((ws, id, changes) => ({ recordId: id, ...changes })),
    };
    service = createRecordOperationService({ recordRepo });
  });

  describe('archiveRecord', () => {
    it('sets archivedAt and archivedBy provenance', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE' });
      await service.archiveRecord('ws-1', 'rec-1', actor);
      const updateCall = recordRepo.update.mock.calls[0][2];
      expect(updateCall.archivedAt).toBeDefined();
      expect(updateCall.archivedBy).toEqual({ actorType: 'USER', actorId: 'user-1' });
      expect(updateCall._previousStatus).toBe('ACTIVE');
      expect(updateCall.status).toBe('ARCHIVED');
    });

    it('is idempotent for already-archived records', async () => {
      const archived = { recordId: 'rec-1', status: 'ARCHIVED' };
      recordRepo.getById.mockResolvedValue(archived);
      const result = await service.archiveRecord('ws-1', 'rec-1', actor);
      expect(recordRepo.update).not.toHaveBeenCalled();
      expect(result.status).toBe('ARCHIVED');
    });
  });

  describe('unarchiveRecord', () => {
    it('clears archive provenance on unarchive', async () => {
      recordRepo.getById.mockResolvedValue({
        recordId: 'rec-1',
        status: 'ARCHIVED',
        _previousStatus: 'SUBMITTED',
        archivedAt: '2025-01-01',
        archivedBy: actor,
      });
      await service.unarchiveRecord('ws-1', 'rec-1', actor);
      const updateCall = recordRepo.update.mock.calls[0][2];
      expect(updateCall.archivedAt).toBeNull();
      expect(updateCall.archivedBy).toBeNull();
      expect(updateCall.status).toBe('SUBMITTED');
    });

    it('rejects unarchive on non-archived record', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE' });
      await expect(service.unarchiveRecord('ws-1', 'rec-1', actor))
        .rejects.toThrow('Record is not archived');
    });
  });

  describe('setPriority', () => {
    it('allows setting priority on active record', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ACTIVE', priority: null });
      await service.setPriority('ws-1', 'rec-1', 'HIGH', actor);
      expect(recordRepo.update).toHaveBeenCalledWith('ws-1', 'rec-1', { priority: 'HIGH' });
    });

    it('rejects priority change on archived record', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'ARCHIVED' });
      await expect(service.setPriority('ws-1', 'rec-1', 'HIGH', actor))
        .rejects.toThrow('Cannot change priority');
    });

    it('rejects invalid priority value', async () => {
      await expect(service.setPriority('ws-1', 'rec-1', 'ULTRA', actor))
        .rejects.toThrow('Invalid priority');
    });
  });

  describe('bulkOperation', () => {
    it('rejects more than 50 records', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `rec-${i}`);
      await expect(service.bulkOperation('ws-1', ids, 'archive', {}, actor))
        .rejects.toThrow('limited to 50');
    });

    it('rejects empty array', async () => {
      await expect(service.bulkOperation('ws-1', [], 'archive', {}, actor))
        .rejects.toThrow('non-empty array');
    });
  });
});
