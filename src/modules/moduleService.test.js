/**
 * ModuleService — Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createModuleService } from './moduleService.js';

const validActor = { actorType: 'USER', actorId: 'user-1' };

function makeMockRepo() {
  const store = {};
  return {
    store,
    create: async (mod) => {
      store[mod.moduleId] = { ...mod };
      return store[mod.moduleId];
    },
    getById: async (wsId, modId) => {
      const m = store[modId];
      return m && m.workspaceId === wsId ? m : null;
    },
    getByCode: async (wsId, code) => {
      return Object.values(store).find((m) => m.workspaceId === wsId && m.moduleCode === code) || null;
    },
    listByWorkspace: async (wsId) => {
      return Object.values(store).filter((m) => m.workspaceId === wsId);
    },
    update: async (wsId, modId, changes) => {
      if (!store[modId]) return null;
      store[modId] = { ...store[modId], ...changes };
      return store[modId];
    },
  };
}

describe('ModuleService', () => {
  let service;
  let repo;

  beforeEach(() => {
    repo = makeMockRepo();
    service = createModuleService({ moduleRepo: repo });
  });

  describe('createModule', () => {
    it('creates a DRAFT module with valid inputs', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1',
        moduleCode: 'ROOM_INSPECTION',
        name: 'Room Inspection',
        createdBy: validActor,
      });

      expect(mod.moduleId).toBeTruthy();
      expect(mod.workspaceId).toBe('ws-1');
      expect(mod.moduleCode).toBe('ROOM_INSPECTION');
      expect(mod.status).toBe('DRAFT');
      expect(mod.version).toBe(1);
    });

    it('rejects invalid module code format', async () => {
      await expect(service.createModule({
        workspaceId: 'ws-1',
        moduleCode: 'invalid',
        name: 'Test',
        createdBy: validActor,
      })).rejects.toThrow('uppercase');
    });

    it('rejects duplicate moduleCode in same workspace', async () => {
      await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'TEST', name: 'Test 1', createdBy: validActor,
      });
      await expect(service.createModule({
        workspaceId: 'ws-1', moduleCode: 'TEST', name: 'Test 2', createdBy: validActor,
      })).rejects.toThrow('already exists');
    });

    it('allows same moduleCode in different workspaces', async () => {
      await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'TEST', name: 'Test 1', createdBy: validActor,
      });
      const mod = await service.createModule({
        workspaceId: 'ws-2', moduleCode: 'TEST', name: 'Test 2', createdBy: validActor,
      });
      expect(mod.moduleCode).toBe('TEST');
    });
  });

  describe('lifecycle', () => {
    let moduleId;

    beforeEach(async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'LIFE', name: 'Lifecycle Test',
        createdBy: validActor,
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
        },
      });
      moduleId = mod.moduleId;
    });

    it('activates a DRAFT module', async () => {
      const activated = await service.activateModule('ws-1', moduleId, validActor);
      expect(activated.status).toBe('ACTIVE');
    });

    it('rejects activating a module with no fields', async () => {
      const emptyMod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'EMPTY', name: 'Empty',
        createdBy: validActor,
      });
      await expect(service.activateModule('ws-1', emptyMod.moduleId, validActor))
        .rejects.toThrow('at least one form field');
    });

    it('deactivates an ACTIVE module', async () => {
      await service.activateModule('ws-1', moduleId, validActor);
      const deactivated = await service.deactivateModule('ws-1', moduleId, validActor);
      expect(deactivated.status).toBe('INACTIVE');
    });

    it('rejects deactivating a non-ACTIVE module', async () => {
      await expect(service.deactivateModule('ws-1', moduleId, validActor))
        .rejects.toThrow('Only active');
    });

    it('archives a module', async () => {
      const archived = await service.archiveModule('ws-1', moduleId, validActor);
      expect(archived.status).toBe('ARCHIVED');
    });

    it('rejects activating an archived module', async () => {
      await service.archiveModule('ws-1', moduleId, validActor);
      await expect(service.activateModule('ws-1', moduleId, validActor))
        .rejects.toThrow('Archived');
    });

    it('rejects modifying an archived module', async () => {
      await service.archiveModule('ws-1', moduleId, validActor);
      await expect(service.updateModule('ws-1', moduleId, { name: 'New Name' }, validActor))
        .rejects.toThrow('Archived');
    });
  });

  describe('versioning', () => {
    it('increments version on ACTIVE module schema change', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'VER', name: 'Versioned',
        createdBy: validActor,
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'a', label: 'A', type: 'text', required: false }],
        },
      });
      await service.activateModule('ws-1', mod.moduleId, validActor);

      const updated = await service.updateModule('ws-1', mod.moduleId, {
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [
            { key: 'a', label: 'A', type: 'text', required: false },
            { key: 'b', label: 'B', type: 'text', required: false },
          ],
        },
      }, validActor);

      expect(updated.version).toBe(2);
    });

    it('does NOT increment version on DRAFT module schema change', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'DRAFT_VER', name: 'Draft Versioned',
        createdBy: validActor,
      });

      const updated = await service.updateModule('ws-1', mod.moduleId, {
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'a', label: 'A', type: 'text', required: false }],
        },
      }, validActor);

      expect(updated.version).toBe(1);
    });
  });

  describe('immutability protection', () => {
    it('strips immutable fields from update', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'IMMUT', name: 'Immutable Test',
        createdBy: validActor,
      });

      const updated = await service.updateModule('ws-1', mod.moduleId, {
        moduleId: 'HACKED',
        workspaceId: 'HACKED',
        moduleCode: 'HACKED',
        createdBy: { actorType: 'USER', actorId: 'hacker' },
        createdAt: '2020-01-01',
        name: 'Updated Name',
      }, validActor);

      expect(updated.moduleId).toBe(mod.moduleId);
      expect(updated.workspaceId).toBe('ws-1');
      expect(updated.moduleCode).toBe('IMMUT');
      expect(updated.name).toBe('Updated Name');
    });
  });
});
