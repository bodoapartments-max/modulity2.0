import { describe, it, expect } from 'vitest';
import {
  createEntityType,
  validateFieldDefinition,
  validateEntityData,
  ENTITY_TYPE_CATEGORIES,
  FIELD_TYPES,
} from './entityType.js';

describe('entityType', () => {
  const baseArgs = {
    typeId: 'type-1',
    code: 'ROOM',
    name: 'Room',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    workspaceId: 'ws-1',
  };

  const validField = { key: 'name', label: 'Name', type: FIELD_TYPES.TEXT, required: true };

  it('creates a valid core entity type', () => {
    const type = createEntityType({ ...baseArgs, fields: [validField] });
    expect(type.typeId).toBe('type-1');
    expect(type.category).toBe('CORE');
    expect(type.status).toBe('ACTIVE');
  });

  it('creates a valid domain entity type', () => {
    const type = createEntityType({
      ...baseArgs,
      category: ENTITY_TYPE_CATEGORIES.DOMAIN,
      code: 'PROJECT',
      name: 'Project',
      fields: [validField],
    });
    expect(type.category).toBe('DOMAIN');
    expect(type.code).toBe('PROJECT');
  });

  it('rejects a missing typeId', () => {
    expect(() => createEntityType({ ...baseArgs, typeId: '', fields: [validField] })).toThrow('typeId is required');
  });

  it('rejects a missing code', () => {
    expect(() => createEntityType({ ...baseArgs, code: '', fields: [validField] })).toThrow('code is required');
  });

  it('rejects a missing name', () => {
    expect(() => createEntityType({ ...baseArgs, name: '', fields: [validField] })).toThrow('name is required');
  });

  it('rejects a missing category', () => {
    expect(() => createEntityType({ ...baseArgs, category: '', fields: [validField] })).toThrow('Invalid category:');
  });

  it('rejects an invalid category', () => {
    expect(() => createEntityType({ ...baseArgs, category: 'INVALID', fields: [validField] })).toThrow('Invalid category: INVALID');
  });

  it('rejects an invalid status', () => {
    expect(() => createEntityType({ ...baseArgs, status: 'PENDING', fields: [validField] })).toThrow('Invalid status: PENDING');
  });

  it('rejects a missing workspaceId', () => {
    expect(() => createEntityType({ ...baseArgs, workspaceId: '', fields: [validField] })).toThrow('workspaceId is required');
  });

  it('validates the fields array', () => {
    expect(() => createEntityType({ ...baseArgs, fields: 'not-array' })).toThrow('fields must be an array');
    expect(() => createEntityType({ ...baseArgs, fields: [{ label: 'Name', type: 'text' }] })).toThrow('Field key is required');
    expect(() => createEntityType({ ...baseArgs, fields: [{ key: 'name', type: 'text' }] })).toThrow('Field label is required');
  });

  it('returns a frozen result', () => {
    const type = createEntityType({ ...baseArgs, fields: [validField] });
    expect(Object.isFrozen(type)).toBe(true);
    expect(Object.isFrozen(type.fields)).toBe(true);
  });

  describe('validateFieldDefinition', () => {
    it('passes for a valid field', () => {
      const result = validateFieldDefinition(validField);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails for a missing key', () => {
      const result = validateFieldDefinition({ label: 'Name', type: 'text' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field key is required');
    });

    it('fails for a missing label', () => {
      const result = validateFieldDefinition({ key: 'name', type: 'text' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field label is required');
    });

    it('fails for an unknown type', () => {
      const result = validateFieldDefinition({ key: 'name', label: 'Name', type: 'unknown' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown field type: unknown');
    });
  });

  describe('validateEntityData', () => {
    const fields = [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: false },
    ];

    it('passes when all required fields are present', () => {
      const result = validateEntityData({ firstName: 'Ada', lastName: 'Lovelace' }, fields);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('fails when a required field is missing', () => {
      const result = validateEntityData({ lastName: 'Lovelace' }, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.firstName).toBe('First Name is required');
    });

    it('passes when an optional field is missing', () => {
      const result = validateEntityData({ firstName: 'Ada' }, fields);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });
});
