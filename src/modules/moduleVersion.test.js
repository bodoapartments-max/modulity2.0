/**
 * Module Version Snapshot — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { createModuleVersionSnapshot } from './moduleVersion.js';

const validActor = { actorType: 'USER', actorId: 'user-1' };
const validSchema = {
  schemaVersion: '1.0.0',
  fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
};

describe('createModuleVersionSnapshot', () => {
  it('creates a valid frozen version snapshot', () => {
    const snap = createModuleVersionSnapshot({
      moduleId: 'mod-1',
      workspaceId: 'ws-1',
      version: 1,
      moduleCode: 'ROOM_INSPECTION',
      name: 'Room Inspection',
      formSchema: validSchema,
      createdBy: validActor,
    });

    expect(snap.moduleId).toBe('mod-1');
    expect(snap.workspaceId).toBe('ws-1');
    expect(snap.version).toBe(1);
    expect(snap.moduleCode).toBe('ROOM_INSPECTION');
    expect(snap.name).toBe('Room Inspection');
    expect(snap.formSchema.fields).toHaveLength(1);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.formSchema)).toBe(true);
    expect(Object.isFrozen(snap.createdBy)).toBe(true);
  });

  it('requires moduleId', () => {
    expect(() => createModuleVersionSnapshot({
      workspaceId: 'ws-1', version: 1, moduleCode: 'X', name: 'X',
      formSchema: validSchema, createdBy: validActor,
    })).toThrow('moduleId');
  });

  it('requires workspaceId', () => {
    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', version: 1, moduleCode: 'X', name: 'X',
      formSchema: validSchema, createdBy: validActor,
    })).toThrow('workspaceId');
  });

  it('requires positive integer version', () => {
    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', workspaceId: 'ws-1', version: 0, moduleCode: 'X', name: 'X',
      formSchema: validSchema, createdBy: validActor,
    })).toThrow('version');

    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', workspaceId: 'ws-1', version: 1.5, moduleCode: 'X', name: 'X',
      formSchema: validSchema, createdBy: validActor,
    })).toThrow('version');
  });

  it('requires moduleCode', () => {
    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', workspaceId: 'ws-1', version: 1, name: 'X',
      formSchema: validSchema, createdBy: validActor,
    })).toThrow('moduleCode');
  });

  it('requires formSchema with at least one field', () => {
    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', workspaceId: 'ws-1', version: 1, moduleCode: 'X', name: 'X',
      formSchema: { schemaVersion: '1.0.0', fields: [] }, createdBy: validActor,
    })).toThrow('at least one field');
  });

  it('requires createdBy', () => {
    expect(() => createModuleVersionSnapshot({
      moduleId: 'x', workspaceId: 'ws-1', version: 1, moduleCode: 'X', name: 'X',
      formSchema: validSchema,
    })).toThrow('createdBy');
  });

  it('version 2 can have different schema from version 1', () => {
    const v1 = createModuleVersionSnapshot({
      moduleId: 'mod-1', workspaceId: 'ws-1', version: 1, moduleCode: 'X', name: 'V1',
      formSchema: validSchema, createdBy: validActor,
    });

    const v2 = createModuleVersionSnapshot({
      moduleId: 'mod-1', workspaceId: 'ws-1', version: 2, moduleCode: 'X', name: 'V2',
      formSchema: {
        schemaVersion: '1.0.0',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: false },
        ],
      },
      createdBy: validActor,
    });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.formSchema.fields).toHaveLength(1);
    expect(v2.formSchema.fields).toHaveLength(2);
  });
});
