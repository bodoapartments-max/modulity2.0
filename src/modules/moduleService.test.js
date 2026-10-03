/**
 * ModuleService — Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createModuleService } from './moduleService.js';

const validActor = { actorType: 'USER', actorId: 'user-1' };

function makeMockRepo() {
  const store = {};
  const versionStore = {};
  const codeStore = {};

  return {
    store,
    versionStore,
    codeStore,
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
    createVersionSnapshot: async (wsId, modId, versionData, moduleUpdates = {}) => {
      const key = `${wsId}/${modId}/${versionData.version}`;
      versionStore[key] = { ...versionData };
      // Also apply module updates
      if (store[modId] && Object.keys(moduleUpdates).length > 0) {
        store[modId] = { ...store[modId], ...moduleUpdates };
      }
      return versionData;
    },
    getVersionSnapshot: async (wsId, modId, version) => {
      const key = `${wsId}/${modId}/${version}`;
      return versionStore[key] || null;
    },
    listVersionSnapshots: async (wsId, modId) => {
      const prefix = `${wsId}/${modId}/`;
      return Object.entries(versionStore)
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => v);
    },
    createModuleWithCodeReservation: async (mod) => {
      const codeKey = `${mod.workspaceId}/${mod.moduleCode}`;
      codeStore[codeKey] = { moduleCode: mod.moduleCode, moduleId: mod.moduleId, workspaceId: mod.workspaceId };
      store[mod.moduleId] = { ...mod };
      return store[mod.moduleId];
    },
    isCodeReserved: async (wsId, code) => {
      const codeKey = `${wsId}/${code}`;
      return codeStore[codeKey] || null;
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

    it('rejects EntityReference targets outside the current Workspace registry', async () => {
      const guarded = createModuleService({ moduleRepo: repo, entityTypeRepo: { getById: async () => null, getByCode: async () => null } });
      await expect(guarded.createModule({ workspaceId: 'ws-1', moduleCode: 'CROSS_REF', name: 'Cross Ref', formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'vehicle', label: 'Vehicle', type: 'entity-reference', entityTypeId: 'other-workspace-type', required: true }] }, createdBy: validActor })).rejects.toThrow('not available in this Workspace');
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

    it('atomically reserves code on creation', async () => {
      await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'RESERVED', name: 'Reserved', createdBy: validActor,
      });
      const reservation = repo.codeStore['ws-1/RESERVED'];
      expect(reservation).toBeTruthy();
      expect(reservation.moduleCode).toBe('RESERVED');
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

  describe('version snapshots', () => {
    it('first activation creates Version 1 snapshot', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'SNAP', name: 'Snap Test',
        createdBy: validActor,
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'a', label: 'A', type: 'text', required: true }],
        },
      });
      await service.activateModule('ws-1', mod.moduleId, validActor);

      const v1 = await service.getModuleVersion('ws-1', mod.moduleId, 1);
      expect(v1).toBeTruthy();
      expect(v1.version).toBe(1);
      expect(v1.moduleCode).toBe('SNAP');
      expect(v1.formSchema.fields).toHaveLength(1);
    });

    it('schema change on ACTIVE creates Version 2, preserves Version 1', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'VER_SNAP', name: 'V Snap Test',
        createdBy: validActor,
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'a', label: 'A', type: 'text', required: false }],
        },
      });
      await service.activateModule('ws-1', mod.moduleId, validActor);

      // Schema change on ACTIVE
      await service.updateModule('ws-1', mod.moduleId, {
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [
            { key: 'a', label: 'A', type: 'text', required: false },
            { key: 'b', label: 'B', type: 'text', required: false },
          ],
        },
      }, validActor);

      const v1 = await service.getModuleVersion('ws-1', mod.moduleId, 1);
      const v2 = await service.getModuleVersion('ws-1', mod.moduleId, 2);

      expect(v1.formSchema.fields).toHaveLength(1);
      expect(v2.formSchema.fields).toHaveLength(2);
      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
    });

    it('DRAFT schema change does NOT create version snapshot', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'DRAFT_NS', name: 'Draft No Snap',
        createdBy: validActor,
      });

      await service.updateModule('ws-1', mod.moduleId, {
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'x', label: 'X', type: 'text', required: false }],
        },
      }, validActor);

      const versions = await service.listModuleVersions('ws-1', mod.moduleId);
      expect(versions).toHaveLength(0);
    });

    it('archived module versions remain readable', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'ARCH_VER', name: 'Archive Version Test',
        createdBy: validActor,
        formSchema: {
          schemaVersion: '1.0.0',
          fields: [{ key: 'a', label: 'A', type: 'text', required: true }],
        },
      });
      await service.activateModule('ws-1', mod.moduleId, validActor);
      await service.archiveModule('ws-1', mod.moduleId, validActor);

      const v1 = await service.getModuleVersion('ws-1', mod.moduleId, 1);
      expect(v1).toBeTruthy();
      expect(v1.version).toBe(1);
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

  describe('code uniqueness', () => {
    it('archived module code remains reserved', async () => {
      const mod = await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'ARCH_CODE', name: 'Archived Code',
        createdBy: validActor,
        formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'a', label: 'A', type: 'text', required: true }] },
      });
      await service.archiveModule('ws-1', mod.moduleId, validActor);

      // Attempting to create another module with same code should fail
      await expect(service.createModule({
        workspaceId: 'ws-1', moduleCode: 'ARCH_CODE', name: 'Reuse',
        createdBy: validActor,
      })).rejects.toThrow('already exists');
    });

    it('reservation cannot be reassigned', async () => {
      await service.createModule({
        workspaceId: 'ws-1', moduleCode: 'LOCKED', name: 'Locked',
        createdBy: validActor,
      });
      const reservation = repo.codeStore['ws-1/LOCKED'];
      expect(reservation.moduleCode).toBe('LOCKED');
      // Code is permanently reserved
      const isReserved = await repo.isCodeReserved('ws-1', 'LOCKED');
      expect(isReserved).toBeTruthy();
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
