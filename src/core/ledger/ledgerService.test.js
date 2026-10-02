import { describe, it, expect, vi } from 'vitest';
import { createLedgerService } from './ledgerService.js';

function mockDeps() {
  return {
    ledgerBookRepo: {
      bootstrapBookAtomic: vi.fn(async (book, _actor) => ({
        ...book, currentBlockId: 'block_1',
      })),
      getById: vi.fn(async () => ({
        ledgerBookId: 'lb-1', workspaceId: 'ws-1', ledgerCode: 'RI',
        name: 'Test', status: 'ACTIVE', blockSize: 100,
        referencePrefix: 'RI', referenceFormatVersion: 1, currentBlockId: 'block_1',
      })),
      update: vi.fn(async (ws, id, changes) => ({ ledgerBookId: id, ...changes })),
      listByWorkspace: vi.fn(async () => []),
    },
    ledgerEntryRepo: {
      getByBookAndRecord: vi.fn(async () => null),
      registerRecordAtomic: vi.fn(async (ws, params) => ({
        ledgerEntryId: `le_${params.ledgerBookId}_${params.recordId}`,
        sequenceNumber: 1,
        referenceNumber: 'RI-2026-000001',
        _idempotent: false,
        ...params,
      })),
      getById: vi.fn(async () => ({
        ledgerEntryId: 'le-1', entryStatus: 'ACTIVE',
        sequenceNumber: 1, referenceNumber: 'RI-2026-000001',
      })),
      update: vi.fn(async (ws, id, changes) => ({ ledgerEntryId: id, ...changes })),
      listByRecord: vi.fn(async () => []),
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
    it('creates a book atomically (code + book + block)', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      const book = await svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor,
      });
      expect(deps.ledgerBookRepo.bootstrapBookAtomic).toHaveBeenCalledOnce();
      expect(book.currentBlockId).toBe('block_1');
    });

    it('rejects invalid code format', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await expect(svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'invalid', name: 'Test', actor,
      })).rejects.toThrow();
    });

    it('propagates duplicate code error from atomic bootstrap', async () => {
      const deps = mockDeps();
      deps.ledgerBookRepo.bootstrapBookAtomic.mockRejectedValue(new Error('already in use'));
      const svc = createLedgerService(deps);
      await expect(svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor,
      })).rejects.toThrow('already in use');
    });

    it('emits audit entry on create', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.createBook({ workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor });
      expect(deps.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ledger.book_created' }),
      );
    });

    it('succeeds even if audit write fails (documented limitation)', async () => {
      const deps = mockDeps();
      deps.auditService.record.mockRejectedValue(new Error('audit failure'));
      const svc = createLedgerService(deps);
      const book = await svc.createBook({
        workspaceId: 'ws-1', ledgerCode: 'RI', name: 'Test', actor,
      });
      expect(book.currentBlockId).toBe('block_1');
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

    it('always calls registerRecordAtomic (outer check is optimization only)', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      // The atomic method is always called — idempotency is checked inside the transaction
      expect(deps.ledgerEntryRepo.registerRecordAtomic).toHaveBeenCalledOnce();
    });

    it('returns idempotent entry without emitting audit', async () => {
      const deps = mockDeps();
      deps.ledgerEntryRepo.registerRecordAtomic.mockResolvedValue({
        ledgerEntryId: 'le_lb-1_rec-1', sequenceNumber: 5,
        referenceNumber: 'RI-2026-000005', _idempotent: true,
      });
      const svc = createLedgerService(deps);
      const result = await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(result.sequenceNumber).toBe(5);
      expect(result._idempotent).toBe(true);
      // No audit emitted for idempotent return
      expect(deps.auditService.record).not.toHaveBeenCalled();
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

    it('rejects module scope mismatch (validated inside transaction)', async () => {
      const deps = mockDeps();
      deps.ledgerBookRepo.getById.mockResolvedValue({
        ...await deps.ledgerBookRepo.getById(), moduleId: 'mod-X',
      });
      deps.recordRepo.getById.mockResolvedValue({
        recordId: 'rec-1', status: 'SUBMITTED', moduleId: 'mod-Y',
      });
      // The transaction itself rejects scope mismatches
      deps.ledgerEntryRepo.registerRecordAtomic.mockRejectedValue(
        new Error('Record moduleId does not match Ledger Book scope'),
      );
      const svc = createLedgerService(deps);
      await expect(svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      })).rejects.toThrow('moduleId does not match');
    });

    it('emits audit on first registration (not idempotent)', async () => {
      const deps = mockDeps();
      const svc = createLedgerService(deps);
      await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(deps.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ledger.entry_registered' }),
      );
    });

    it('succeeds even if audit write fails after registration', async () => {
      const deps = mockDeps();
      deps.auditService.record.mockRejectedValue(new Error('audit failure'));
      const svc = createLedgerService(deps);
      const entry = await svc.registerRecord({
        workspaceId: 'ws-1', ledgerBookId: 'lb-1', recordId: 'rec-1', actor,
      });
      expect(entry.sequenceNumber).toBe(1);
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

  describe('multi-book policy', () => {
    it('supports getting entries for a record across all books', async () => {
      const deps = mockDeps();
      deps.ledgerEntryRepo.listByRecord.mockResolvedValue([
        { ledgerEntryId: 'le-a', ledgerBookId: 'lb-1', sequenceNumber: 1 },
        { ledgerEntryId: 'le-b', ledgerBookId: 'lb-2', sequenceNumber: 5 },
      ]);
      const svc = createLedgerService(deps);
      const entries = await svc.getEntriesForRecord('ws-1', 'rec-1');
      expect(entries).toHaveLength(2);
      expect(entries[0].ledgerBookId).toBe('lb-1');
      expect(entries[1].ledgerBookId).toBe('lb-2');
    });
  });
});
