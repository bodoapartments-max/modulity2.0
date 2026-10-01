/**
 * ModuleSubmissionService — Unit Tests
 *
 * Full integration test: Module → Form validation → Record creation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createModuleSubmissionService } from './moduleSubmissionService.js';
import { createModule, MODULE_STATUSES } from './module.js';

const validActor = { actorType: 'USER', actorId: 'user-1' };

function makeActiveModule(overrides = {}) {
  return createModule({
    moduleId: 'mod-1',
    workspaceId: 'ws-1',
    moduleCode: 'TEST_MOD',
    name: 'Test Module',
    status: MODULE_STATUSES.ACTIVE,
    version: 1,
    formSchema: {
      schemaVersion: '1.0.0',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'notes', label: 'Notes', type: 'textarea', required: false },
      ],
    },
    createdBy: validActor,
    ...overrides,
  });
}

function makeMockModuleRepo(mod) {
  return {
    getById: async (wsId, modId) => {
      if (mod && mod.moduleId === modId && mod.workspaceId === wsId) return mod;
      return null;
    },
  };
}

function makeMockRecordService() {
  const records = [];
  return {
    records,
    createRecord: async (params) => {
      const record = {
        recordId: 'rec-' + records.length,
        ...params,
        createdAt: new Date().toISOString(),
      };
      records.push(record);
      return record;
    },
    getRecord: async (wsId, recId) => records.find((r) => r.recordId === recId) || null,
    updateDraftRecord: async (wsId, recId, changes) => {
      const rec = records.find((r) => r.recordId === recId);
      if (rec) Object.assign(rec, changes);
      return rec;
    },
  };
}

describe('ModuleSubmissionService', () => {
  let service;
  let recordService;
  let mod;

  beforeEach(() => {
    mod = makeActiveModule();
    recordService = makeMockRecordService();
    service = createModuleSubmissionService({
      moduleRepo: makeMockModuleRepo(mod),
      recordService,
      entityService: null,
    });
  });

  describe('submitModuleRecord', () => {
    it('creates a canonical SUBMITTED Record from valid form values', async () => {
      const record = await service.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test Room', date: '2024-06-15' },
      });

      expect(record.recordId).toBeTruthy();
      expect(record.moduleId).toBe('mod-1');
      expect(record.recordType).toBe('TEST_MOD');
      expect(record.status).toBe('SUBMITTED');
      expect(record.data.name).toBe('Test Room');
      expect(record.data.date).toBe('2024-06-15');
      expect(record.submittedAt).toBeTruthy();
    });

    it('rejects missing required fields', async () => {
      await expect(service.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { date: '2024-06-15' },
      })).rejects.toThrow('validation failed');
    });

    it('rejects undeclared fields', async () => {
      await expect(service.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15', hackedField: 'injected' },
      })).rejects.toThrow('validation failed');
    });

    it('rejects submission for non-existent module', async () => {
      await expect(service.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'nonexistent',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      })).rejects.toThrow('not found');
    });

    it('rejects submission for ARCHIVED module', async () => {
      const archivedMod = makeActiveModule({ status: MODULE_STATUSES.ARCHIVED });
      const svc = createModuleSubmissionService({
        moduleRepo: makeMockModuleRepo(archivedMod),
        recordService,
        entityService: null,
      });

      await expect(svc.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      })).rejects.toThrow('archived');
    });

    it('rejects submission for INACTIVE module', async () => {
      const inactiveMod = makeActiveModule({ status: MODULE_STATUSES.INACTIVE });
      const svc = createModuleSubmissionService({
        moduleRepo: makeMockModuleRepo(inactiveMod),
        recordService,
        entityService: null,
      });

      await expect(svc.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      })).rejects.toThrow('inactive');
    });

    it('allows DRAFT module submission for testing', async () => {
      const draftMod = makeActiveModule({ status: MODULE_STATUSES.DRAFT });
      const svc = createModuleSubmissionService({
        moduleRepo: makeMockModuleRepo(draftMod),
        recordService,
        entityService: null,
      });

      const record = await svc.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      });

      expect(record.status).toBe('SUBMITTED');
    });

    it('creates exactly ONE record per submission', async () => {
      await service.submitModuleRecord({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      });

      expect(recordService.records).toHaveLength(1);
    });
  });

  describe('saveDraft', () => {
    it('creates a DRAFT record', async () => {
      const record = await service.saveDraft({
        workspaceId: 'ws-1',
        moduleId: 'mod-1',
        actor: validActor,
        values: { name: 'Test', date: '2024-06-15' },
      });

      expect(record.status).toBe('DRAFT');
      expect(record.submittedAt).toBeNull();
    });
  });
});
