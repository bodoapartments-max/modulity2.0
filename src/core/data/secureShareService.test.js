import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSecureShareService } from './secureShareService.js';

describe('secureShareService', () => {
  let service;
  let shareTokenRepo;
  let recordRepo;

  beforeEach(() => {
    shareTokenRepo = {
      getById: vi.fn(),
      getByHash: vi.fn(),
      create: vi.fn((token) => token),
      update: vi.fn((ws, id, changes) => ({ tokenId: id, ...changes })),
      redeemTokenAtomic: vi.fn(),
      listByRecord: vi.fn().mockResolvedValue([]),
    };
    recordRepo = {
      getById: vi.fn(),
    };
    service = createSecureShareService({ shareTokenRepo, recordRepo });
  });

  describe('redeemToken', () => {
    it('rejects redemption without userId', async () => {
      await expect(service.redeemToken('ws-1', 'token', null))
        .rejects.toThrow('Authenticated user identity');
    });

    it('rejects unknown token hash', async () => {
      shareTokenRepo.getByHash.mockResolvedValue(null);
      await expect(service.redeemToken('ws-1', 'bad-token', 'user-1'))
        .rejects.toThrow('Invalid or expired');
    });

    it('delegates to redeemTokenAtomic for concurrency safety', async () => {
      shareTokenRepo.getByHash.mockResolvedValue({ tokenId: 'tok-1', status: 'ACTIVE' });
      shareTokenRepo.redeemTokenAtomic.mockResolvedValue({
        token: { tokenId: 'tok-1', status: 'REDEEMED' },
        recordId: 'rec-1',
        scope: 'READ',
      });

      const result = await service.redeemToken('ws-1', 'valid-token', 'user-1');
      expect(shareTokenRepo.redeemTokenAtomic).toHaveBeenCalledWith('ws-1', 'tok-1', 'user-1');
      expect(result.recordId).toBe('rec-1');
    });

    it('maps expired transaction error to AppError', async () => {
      shareTokenRepo.getByHash.mockResolvedValue({ tokenId: 'tok-1', status: 'ACTIVE' });
      shareTokenRepo.redeemTokenAtomic.mockRejectedValue(new Error('Token has expired'));

      await expect(service.redeemToken('ws-1', 'token', 'user-1'))
        .rejects.toThrow('Token has expired');
    });

    it('maps limit-reached transaction error to AppError', async () => {
      shareTokenRepo.getByHash.mockResolvedValue({ tokenId: 'tok-1', status: 'ACTIVE' });
      shareTokenRepo.redeemTokenAtomic.mockRejectedValue(new Error('Token redemption limit reached'));

      await expect(service.redeemToken('ws-1', 'token', 'user-1'))
        .rejects.toThrow('Token redemption limit reached');
    });
  });

  describe('revokeToken', () => {
    it('only allows creator to revoke', async () => {
      shareTokenRepo.getById.mockResolvedValue({
        tokenId: 'tok-1',
        status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user-1' },
      });
      const otherActor = { actorType: 'USER', actorId: 'user-99' };
      await expect(service.revokeToken('ws-1', 'tok-1', otherActor))
        .rejects.toThrow('Only the token creator');
    });
  });
});
