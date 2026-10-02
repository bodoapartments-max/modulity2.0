import { describe, it, expect, vi } from 'vitest';
import { createLedgerService } from './ledgerService.js';

function mockDeps() {
  return {
    ledgerBookRepo: {
      create: vi.fn(async (book) => book),
      getById: vi.fn(async () => ({
        ledgerBookId: 'lb-1', workspaceId: 'ws-1', ledgerCode: 'RI',
        name: 'Test', status: 'ACTIVE', blockSize: 100,
        referencePrefix: 'RI', referenceFormatVersion: 1, currentBlockId: 'block_1',
      })),
      update: vi.fn(async (ws, id, changes) => ({ ledgerBookId: id, ...changes })),
      openInitialBlock: vi.fn(async () => 'block_1'),
      listByWorkspace: vi.fn(async () => []),
    },
    ledgerEntryRepo: {
      getByBookAndRecord: vi.fn(async () => null),
      registerRecordAtomic: vi.fn(async (ws, params) => ({
        ledgerEntryId: 'le-1',
        sequenceNumber: 1,
        referenceNumber: 'RI-2026-000001',
        ...params,
      })),
      getById: vi.fn(async () => ({
        ledgerEntryId: 'le-1', entryStatus: 'ACTIVE',
        sequenceNumber: 1, referenceNumber: 'RI-2026-000001',
      })),
      update: vi.fn(async (ws, id, changes) => ({ ledgerEntryId: id, ...changes })),
    },
    ledgerCodeRepo: {
      reserve: vi.fn(async () => true),
    },
    recordRepo: {
      getById: vi.fn(async () => ({
        recordId: 'rec-1', workspaceId: 'ws-1',
        status: 'SUBMITTED', moduleId: null, moduleVersion: null, recordType: 'inspection',
      })),
    },
    auditService: {
      record: vi.fn(async () => ({})),
    },
  };
}

const actor = { actorType: 'USER', actorId: 'u1' };

describe('ledgerService', () => {
  describe('createBook', () => {
    it('creates a book and opens initial block', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      const book = await svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor,
      });
      expect(deps.ledgerCodeRepo.reserve).toHaveBeenCalledWith('ws-1', 'RI', actor);
      expect(deps.ledgerBookRepo.create).toHaveBeenCalledOnce();
      expect(deps.ledgerBookRepo.openInitialBlock).toHaveBeenCalledOnce();
      expect(book.currentBlockId).toBe('block_1');
    });

    it('rejects duplicate code', async () => {
      const deps = mockDeps();
      deps.ledgerCodeRepo.reserve.mockResolvedValue(false);
      const svc = createLedgerService(deps);
      await expect(svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor,
      })).rejects.toThrow('already in use');
    });

    it('rejects invalid code format', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await expect(svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'invalid', name: 'Test', actor,
      })).rejects.toThrow();
    });

    it('emits audit entry on create', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.createBook({ workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor });
      expect(deps.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ledger.book_created' }),
      );
    });
  });

  describe('registerRecord', () => {
    it('registers a record atomically', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      const entry = await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(deps.ledgerEntryRepo.registerRecordAtomic).toHaveBeenCalledOnce();
      expect(entry.sequenceNumber).toBe(1);
    });

    it('returns existing entry idempotently', async () => {
      const deps = mockDeps();
      const existing = { ledgerEntryId: 'le-1', sequenceNumber: 5 };
      deps.ledgerEntryRepo.getByBookAndRecord.mockResolvedValue(existing);
      const svc = createLedgerService(deps);
      const result = await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(result).toBe(existing);
      expect(deps.ledgerEntryRepo.registerRecordAtomic).not.toHaveBeenCalled();
    });

    it('rejects non-active book', async () => {
      const deps = mockDeps();
      deps.ledgerBookRepo.getById.mockResolvedValue({ ...await deps.ledgerBookRepo.getById(), status: 'CLOSED' });
      const svc = createLedgerService(deps);
      await expect(svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      })).rejects.toThrow('not active');
    });

    it('rejects DRAFT records', async () => {
      const deps = mockDeps();
      deps.recordRepo.getById.mockResolvedValue({ recordId: 'rec-1', status: 'DRAFT' });
      const svc = createLedgerService(deps);
      await expect(svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      })).rejects.toThrow('not eligible');
    });

    it('rejects module scope mismatch', async () => {
      const deps = mockDeps();
      deps.ledgerBookRepo.getById.mockResolvedValue({
        ...await deps.ledgerBookRepo.getById(), moduleId: 'mod-X',
      });
      deps.recordRepo.getById.mockResolvedValue({
        recordId: 'rec-1', status: 'SUBMITTED', moduleId: 'mod-Y',
      });
      const svc = createLedgerService(deps);
      await expect(svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      })).rejects.toThrow('moduleId does not match');
    });

    it('emits audit on registration', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(deps.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ledger.entry_registered' }),
      );
    });
  });

  describe('cancelEntry', () => {
    it('cancels an active entry', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.cancelEntry('ws-1', 'le-1', 'Duplicate', actor);
      expect(deps.ledgerEntryRepo.update).toHaveBeenCalledWith('ws-1', 'le-1', expect.objectContaining({
        entryStatus: 'CANCELLED',
        cancellationReason: 'Duplicate',
      }));
    });

    it('rejects cancelling non-active entry', async () => {
      const deps = mockDeps();
      deps.ledgerEntryRepo.getById.mockResolvedValue({ entryStatus: 'CANCELLED' });
      const svc = createLedgerService(deps);
      await expect(svc.cancelEntry('ws-1', 'le-1', 'reason', actor)).rejects.toThrow('Cannot cancel');
    });
  });

  describe('voidEntry', () => {
    it('voids an active entry', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.voidEntry('ws-1', 'le-1', 'Error', actor);
      expect(deps.ledgerEntryRepo.update).toHaveBeenCalledWith('ws-1', 'le-1', expect.objectContaining({
        entryStatus: 'VOIDED',
        voidReason: 'Error',
      }));
    });
  });

  describe('closeBook', () => {
    it('closes an active book', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.closeBook('ws-1', 'lb-1', actor);
      expect(deps.ledgerBookRepo.update).toHaveBeenCalledWith('ws-1', 'lb-1', expect.objectContaining({
        status: 'CLOSED',
      }));
    });

    it('rejects closing non-active book', async () => {
      const deps = mockDeps();
      deps.ledgerBookRepo.getById.mockResolvedValue({ status: 'CLOSED' });
      const svc = createLedgerService(deps);
      await expect(svc.closeBook('ws-1', 'lb-1', actor)).rejects.toThrow('not active');
    });
  });
});
