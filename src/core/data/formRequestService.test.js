import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFormRequestService, deriveCompletionRecordId } from './formRequestService.js';

describe('deriveCompletionRecordId', () => {
  it('produces deterministic ID from requestId', () => {
    expect(deriveCompletionRecordId('req-1')).toBe('req_req-1');
    expect(deriveCompletionRecordId('req-1')).toBe(deriveCompletionRecordId('req-1'));
  });

  it('different requestIds produce different record IDs', () => {
    expect(deriveCompletionRecordId('req-1')).not.toBe(deriveCompletionRecordId('req-2'));
  });
});

describe('formRequestService', () => {
  let service;
  let formRequestRepo;
  let moduleRepo;
  let membershipRepo;
  let workspaceRepo;

  const actor = { actorType: 'USER', actorId: 'user-2' };
  const requester = { actorType: 'USER', actorId: 'user-1' };

  beforeEach(() => {
    formRequestRepo = {
      getById: vi.fn(),
      create: vi.fn((req) => req),
      update: vi.fn((ws, id, changes) => ({ requestId: id, ...changes })),
      completeRequestAtomic: vi.fn(),
      listByRequester: vi.fn().mockResolvedValue([]),
      listByRecipient: vi.fn().mockResolvedValue([]),
    };
    moduleRepo = {
      getById: vi.fn(),
      getVersionSnapshot: vi.fn(),
    };
    membershipRepo = {
      getByOrgAndUser: vi.fn(),
    };
    workspaceRepo = {
      getById: vi.fn(),
    };
    service = createFormRequestService({ formRequestRepo, moduleRepo, membershipRepo, workspaceRepo });
  });

  describe('completeRequest', () => {
    const inProgressRequest = {
      requestId: 'req-1',
      workspaceId: 'ws-1',
      moduleId: 'mod-1',
      moduleVersion: 2,
      requester,
      recipientUserId: 'user-2',
      status: 'IN_PROGRESS',
      resultRecordId: null,
    };

    const versionSnapshot = {
      version: 2,
      moduleCode: 'WO',
      formSchema: { fields: [] },
      recordConfig: { recordType: 'work-order' },
    };

    it('returns existing result when request is already COMPLETED (idempotency)', async () => {
      formRequestRepo.getById.mockResolvedValue({
        ...inProgressRequest,
        status: 'COMPLETED',
        resultRecordId: 'req_req-1',
      });
      const result = await service.completeRequest('ws-1', 'req-1', {}, actor);
      expect(result.record.recordId).toBe('req_req-1');
      expect(formRequestRepo.completeRequestAtomic).not.toHaveBeenCalled();
    });

    it('rejects non-recipient', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      const wrongActor = { actorType: 'USER', actorId: 'user-99' };
      await expect(service.completeRequest('ws-1', 'req-1', {}, wrongActor))
        .rejects.toThrow('Only the recipient');
    });

    it('rejects terminal state (CANCELLED)', async () => {
      formRequestRepo.getById.mockResolvedValue({ ...inProgressRequest, status: 'CANCELLED' });
      await expect(service.completeRequest('ws-1', 'req-1', {}, actor))
        .rejects.toThrow();
    });

    it('rejects terminal state (DECLINED)', async () => {
      formRequestRepo.getById.mockResolvedValue({ ...inProgressRequest, status: 'DECLINED' });
      await expect(service.completeRequest('ws-1', 'req-1', {}, actor))
        .rejects.toThrow();
    });

    it('rejects terminal state (EXPIRED)', async () => {
      formRequestRepo.getById.mockResolvedValue({ ...inProgressRequest, status: 'EXPIRED' });
      await expect(service.completeRequest('ws-1', 'req-1', {}, actor))
        .rejects.toThrow();
    });

    it('loads exact Module Version snapshot (not current Module)', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      moduleRepo.getVersionSnapshot.mockResolvedValue(versionSnapshot);
      formRequestRepo.completeRequestAtomic.mockResolvedValue({
        request: { ...inProgressRequest, status: 'COMPLETED', resultRecordId: 'req_req-1' },
        record: { recordId: 'req_req-1' },
      });

      await service.completeRequest('ws-1', 'req-1', {}, actor);
      expect(moduleRepo.getVersionSnapshot).toHaveBeenCalledWith('ws-1', 'mod-1', 2);
      expect(moduleRepo.getById).not.toHaveBeenCalled();
    });

    it('uses deterministic record ID (req_requestId)', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      moduleRepo.getVersionSnapshot.mockResolvedValue(versionSnapshot);
      formRequestRepo.completeRequestAtomic.mockResolvedValue({
        request: { ...inProgressRequest, status: 'COMPLETED', resultRecordId: 'req_req-1' },
        record: { recordId: 'req_req-1' },
      });

      await service.completeRequest('ws-1', 'req-1', {}, actor);
      const atomicCall = formRequestRepo.completeRequestAtomic.mock.calls[0];
      const recordData = atomicCall[2]; // Third argument is recordData
      expect(recordData.recordId).toBe('req_req-1');
      expect(recordData.sourceRequestId).toBe('req-1');
    });

    it('uses recordType from version snapshot, not current Module', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      moduleRepo.getVersionSnapshot.mockResolvedValue({
        ...versionSnapshot,
        recordConfig: { recordType: 'v2-work-order' },
      });
      formRequestRepo.completeRequestAtomic.mockResolvedValue({
        request: { ...inProgressRequest, status: 'COMPLETED', resultRecordId: 'req_req-1' },
        record: { recordId: 'req_req-1' },
      });

      await service.completeRequest('ws-1', 'req-1', {}, actor);
      const recordData = formRequestRepo.completeRequestAtomic.mock.calls[0][2];
      expect(recordData.recordType).toBe('v2-work-order');
    });

    it('throws when Module Version snapshot not found', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      moduleRepo.getVersionSnapshot.mockResolvedValue(null);
      await expect(service.completeRequest('ws-1', 'req-1', {}, actor))
        .rejects.toThrow('Module version snapshot not found');
    });

    it('calls completeRequestAtomic with correct request updates', async () => {
      formRequestRepo.getById.mockResolvedValue(inProgressRequest);
      moduleRepo.getVersionSnapshot.mockResolvedValue(versionSnapshot);
      formRequestRepo.completeRequestAtomic.mockResolvedValue({
        request: { ...inProgressRequest, status: 'COMPLETED', resultRecordId: 'req_req-1' },
        record: { recordId: 'req_req-1' },
      });

      await service.completeRequest('ws-1', 'req-1', {}, actor);
      const requestUpdates = formRequestRepo.completeRequestAtomic.mock.calls[0][3];
      expect(requestUpdates.status).toBe('COMPLETED');
      expect(requestUpdates.resultRecordId).toBe('req_req-1');
    });
  });

  describe('createFormRequest with recipient validation', () => {
    it('rejects non-member recipient in org workspace', async () => {
      moduleRepo.getById.mockResolvedValue({ moduleId: 'mod-1', status: 'ACTIVE', version: 1 });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue(null);

      await expect(service.createFormRequest({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        recipientUserId: 'user-2',
        requester,
      })).rejects.toThrow('active member');
    });

    it('rejects suspended member recipient', async () => {
      moduleRepo.getById.mockResolvedValue({ moduleId: 'mod-1', status: 'ACTIVE', version: 1 });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue({ status: 'SUSPENDED' });

      await expect(service.createFormRequest({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        recipientUserId: 'user-2',
        requester,
      })).rejects.toThrow('active member');
    });

    it('allows active member recipient', async () => {
      moduleRepo.getById.mockResolvedValue({ moduleId: 'mod-1', status: 'ACTIVE', version: 1 });
      workspaceRepo.getById.mockResolvedValue({ type: 'ORGANIZATION', organizationId: 'org-1' });
      membershipRepo.getByOrgAndUser.mockResolvedValue({ status: 'ACTIVE' });
      formRequestRepo.create.mockImplementation((req) => req);

      const result = await service.createFormRequest({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        recipientUserId: 'user-2',
        requester,
      });
      expect(result.moduleId).toBe('mod-1');
    });
  });
});
