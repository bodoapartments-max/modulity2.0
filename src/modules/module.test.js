/**
 * Module Definition — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { createModule, MODULE_STATUSES, validateModuleCode } from './module.js';

const validActor = { actorType: 'USER', actorId: 'user-1' };

describe('createModule', () => {
  it('creates a valid frozen Module definition', () => {
    const mod = createModule({
      moduleId: 'mod-1',
      workspaceId: 'ws-1',
      moduleCode: 'ROOM_INSPECTION',
      name: 'Room Inspection',
      createdBy: validActor,
    });

    expect(mod.moduleId).toBe('mod-1');
    expect(mod.workspaceId).toBe('ws-1');
    expect(mod.moduleCode).toBe('ROOM_INSPECTION');
    expect(mod.name).toBe('Room Inspection');
    expect(mod.status).toBe('DRAFT');
    expect(mod.version).toBe(1);
    expect(mod.formSchema.schemaVersion).toBe('1.0.0');
    expect(mod.formSchema.fields).toEqual([]);
    expect(mod.recordConfig.recordType).toBe('ROOM_INSPECTION');
    expect(Object.isFrozen(mod)).toBe(true);
    expect(Object.isFrozen(mod.formSchema)).toBe(true);
    expect(Object.isFrozen(mod.createdBy)).toBe(true);
  });

  it('requires moduleId', () => {
    expect(() => createModule({ workspaceId: 'ws-1', moduleCode: 'X', name: 'X', createdBy: validActor })).toThrow('moduleId');
  });

  it('requires workspaceId', () => {
    expect(() => createModule({ moduleId: 'x', moduleCode: 'X', name: 'X', createdBy: validActor })).toThrow('workspaceId');
  });

  it('requires moduleCode', () => {
    expect(() => createModule({ moduleId: 'x', workspaceId: 'ws-1', name: 'X', createdBy: validActor })).toThrow('moduleCode');
  });

  it('requires name', () => {
    expect(() => createModule({ moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X', createdBy: validActor })).toThrow('name');
  });

  it('requires createdBy', () => {
    expect(() => createModule({ moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X', name: 'X' })).toThrow('createdBy');
  });

  it('rejects invalid status', () => {
    expect(() => createModule({
      moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X', name: 'X',
      status: 'INVALID', createdBy: validActor,
    })).toThrow('Invalid module status');
  });

  it('rejects non-integer version', () => {
    expect(() => createModule({
      moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X', name: 'X',
      version: 1.5, createdBy: validActor,
    })).toThrow('version');
  });

  it('rejects zero version', () => {
    expect(() => createModule({
      moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X', name: 'X',
      version: 0, createdBy: validActor,
    })).toThrow('version');
  });

  it('derives recordType from moduleCode', () => {
    const mod = createModule({
      moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'TEST_CODE',
      name: 'Test', createdBy: validActor,
    });
    expect(mod.recordConfig.recordType).toBe('TEST_CODE');
  });

  it('uses explicit recordConfig.recordType', () => {
    const mod = createModule({
      moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'TEST_CODE',
      name: 'Test', createdBy: validActor,
      recordConfig: { recordType: 'CUSTOM_TYPE' },
    });
    expect(mod.recordConfig.recordType).toBe('CUSTOM_TYPE');
  });

  it('accepts all valid statuses', () => {
    for (const status of Object.values(MODULE_STATUSES)) {
      const mod = createModule({
        moduleId: 'x', workspaceId: 'ws-1', moduleCode: 'X',
        name: 'X', status, createdBy: validActor,
      });
      expect(mod.status).toBe(status);
    }
  });
});

describe('validateModuleCode', () => {
  it('accepts valid codes', () => {
    expect(validateModuleCode('ROOM_INSPECTION').valid).toBe(true);
    expect(validateModuleCode('A').valid).toBe(true);
    expect(validateModuleCode('ABC123').valid).toBe(true);
    expect(validateModuleCode('A_B_C').valid).toBe(true);
  });

  it('rejects empty', () => {
    expect(validateModuleCode('').valid).toBe(false);
    expect(validateModuleCode(null).valid).toBe(false);
    expect(validateModuleCode(undefined).valid).toBe(false);
  });

  it('rejects lowercase', () => {
    expect(validateModuleCode('room_inspection').valid).toBe(false);
  });

  it('rejects starting with number', () => {
    expect(validateModuleCode('1ABC').valid).toBe(false);
  });

  it('rejects starting with underscore', () => {
    expect(validateModuleCode('_ABC').valid).toBe(false);
  });

  it('rejects spaces', () => {
    expect(validateModuleCode('ROOM INSPECTION').valid).toBe(false);
  });
});
