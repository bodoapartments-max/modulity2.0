import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecordDeliveryService } from './recordDeliveryService.js';

describe('recordDeliveryService', () => {
  let service;
  let deliveryRepo;
  let recordRepo;
  let membershipRepo;
  let workspaceRepo;

  const sender = { actorType: 'USER', actorId: 'user-1' };

  beforeEach(() => {
    deliveryRepo = {
      getById: vi.fn(),
      create: vi.fn((d) => d),
      update: vi.fn((ws, id, changes) => ({ deliveryId: id, ...changes })),
      listBySender: vi.fn().mockResolvedValue([]),
      listByRecipient: vi.fn().mockResolvedValue([]),
      listByRecord: vi.fn().mockResolvedValue([]),
    };
    recordRepo = {
      getById: vi.fn(),
    };
    membershipRepo = {
      getByOrgAndUser: vi.fn(),
    };
    workspaceRepo = {
      getById: vi.fn(),
    };
    service = createRecordDeliveryService({ deliveryRepo, recordRepo, membershipRepo, workspaceRepo });
  });

  describe('sendRecord recipient validation', () => {
    it('rejects non-member recipient in org workspace', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1' });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue(null);

      await expect(service.sendRecord({
        workspaceId: 'ws-1',
        recordId: 'rec-1',
        recipientUserId: 'user-2',
        sender,
      })).rejects.toThrow('active member');
    });

    it('rejects suspended member', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1' });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue({ status: 'SUSPENDED' });

      await expect(service.sendRecord({
        workspaceId: 'ws-1',
        recordId: 'rec-1',
        recipientUserId: 'user-2',
        sender,
      })).rejects.toThrow('active member');
    });

    it('allows active member recipient', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1' });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue({ status: 'ACTIVE' });

      const result = await service.sendRecord({
        workspaceId: 'ws-1',
        recordId: 'rec-1',
        recipientUserId: 'user-2',
        sender,
      });
      expect(result.recordId).toBe('rec-1');
    });

    it('rejects self-delivery', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1' });
      await expect(service.sendRecord({
        workspaceId: 'ws-1',
        recordId: 'rec-1',
        recipientUserId: 'user-1',
        sender,
      })).rejects.toThrow('Cannot send a record to yourself');
    });

    it('rejects non-owner in personal workspace', async () => {
      recordRepo.getById.mockResolvedValue({ recordId: 'rec-1' });
      workspaceRepo.getById.mockResolvedValue({ type: 'PERSONAL', ownerUserId: 'user-99' });

      await expect(service.sendRecord({
        workspaceId: 'ws-1',
        recordId: 'rec-1',
        recipientUserId: 'user-2',
        sender,
      })).rejects.toThrow('workspace owner');
    });
  });
});
