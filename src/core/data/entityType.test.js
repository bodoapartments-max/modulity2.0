import { describe, it, expect } from 'vitest';
import {
  createEntityType,
  validateFieldDefinition,
  validateFieldDefinitions,
  validateFieldValue,
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

    it('rejects invalid key format (starts with number)', () => {
      const result = validateFieldDefinition({ key: '1bad', label: 'Bad', type: 'text' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/must start with a letter/);
    });

    it('rejects key with special characters', () => {
      const result = validateFieldDefinition({ key: 'bad-key', label: 'Bad', type: 'text' });
      expect(result.valid).toBe(false);
    });

    it('accepts key with underscores', () => {
      const result = validateFieldDefinition({ key: 'room_number', label: 'Room', type: 'text' });
      expect(result.valid).toBe(true);
    });

    it('rejects non-boolean required', () => {
      const result = validateFieldDefinition({ key: 'k', label: 'K', type: 'text', required: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field required must be a boolean');
    });

    it('rejects select field without options', () => {
      const result = validateFieldDefinition({ key: 'k', label: 'K', type: 'select' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Select field must have a non-empty options array');
    });

    it('accepts select field with options', () => {
      const result = validateFieldDefinition({ key: 'k', label: 'K', type: 'select', options: ['A', 'B'] });
      expect(result.valid).toBe(true);
    });

    it('rejects number field with min > max', () => {
      const result = validateFieldDefinition({ key: 'k', label: 'K', type: 'number', min: 10, max: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field min must not exceed max');
    });

    it('rejects text field with minLength > maxLength', () => {
      const result = validateFieldDefinition({ key: 'k', label: 'K', type: 'text', minLength: 10, maxLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field minLength must not exceed maxLength');
    });
  });

  describe('validateFieldDefinitions', () => {
    it('rejects duplicate field keys', () => {
      const result = validateFieldDefinitions([
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'name', label: 'Name Again', type: 'text' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate field key: "name"');
    });

    it('passes for unique valid fields', () => {
      const result = validateFieldDefinitions([
        { key: 'firstName', label: 'First', type: 'text' },
        { key: 'lastName', label: 'Last', type: 'text' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFieldValue', () => {
    // ─── TEXT ───
    it('accepts valid text', () => {
      const field = { key: 'k', label: 'Name', type: 'text', required: true };
      expect(validateFieldValue('hello', field)).toBeNull();
    });

    it('rejects non-string for text', () => {
      const field = { key: 'k', label: 'Name', type: 'text', required: true };
      expect(validateFieldValue(42, field)).toMatch(/must be a string/);
    });

    it('rejects text shorter than minLength', () => {
      const field = { key: 'k', label: 'Name', type: 'text', minLength: 3 };
      expect(validateFieldValue('ab', field)).toMatch(/at least 3 characters/);
    });

    it('rejects text longer than maxLength', () => {
      const field = { key: 'k', label: 'Name', type: 'text', maxLength: 5 };
      expect(validateFieldValue('toolong', field)).toMatch(/at most 5 characters/);
    });

    // ─── NUMBER ───
    it('accepts valid number', () => {
      const field = { key: 'k', label: 'Count', type: 'number', required: true };
      expect(validateFieldValue(42, field)).toBeNull();
    });

    it('rejects non-number for number field', () => {
      const field = { key: 'k', label: 'Count', type: 'number', required: true };
      expect(validateFieldValue('not-a-number', field)).toMatch(/must be a finite number/);
    });

    it('rejects NaN for number field', () => {
      const field = { key: 'k', label: 'Count', type: 'number', required: true };
      expect(validateFieldValue(NaN, field)).toMatch(/must be a finite number/);
    });

    it('rejects Infinity for number field', () => {
      const field = { key: 'k', label: 'Count', type: 'number', required: true };
      expect(validateFieldValue(Infinity, field)).toMatch(/must be a finite number/);
    });

    it('rejects number below min', () => {
      const field = { key: 'k', label: 'Count', type: 'number', min: 0 };
      expect(validateFieldValue(-1, field)).toMatch(/at least 0/);
    });

    it('rejects number above max', () => {
      const field = { key: 'k', label: 'Count', type: 'number', max: 100 };
      expect(validateFieldValue(101, field)).toMatch(/at most 100/);
    });

    // ─── DATE RANGE ───
    it('accepts valid date range', () => {
      const field = { key: 'k', label: 'Period', type: 'date-range', required: true };
      expect(validateFieldValue({ start: '2024-03-15', end: '2024-03-20' }, field)).toBeNull();
    });

    it('rejects date range with invalid start', () => {
      const field = { key: 'k', label: 'Period', type: 'date-range', required: true };
      expect(validateFieldValue({ start: 'invalid', end: '2024-03-20' }, field)).toMatch(/start must be a valid ISO date/);
    });

    it('rejects date range where start is after end', () => {
      const field = { key: 'k', label: 'Period', type: 'date-range', required: true };
      expect(validateFieldValue({ start: '2024-03-20', end: '2024-03-15' }, field)).toMatch(/start date cannot be after end date/);
    });

    // ─── DATE ───
    it('accepts valid ISO date', () => {
      const field = { key: 'k', label: 'Date', type: 'date', required: true };
      expect(validateFieldValue('2024-03-15', field)).toBeNull();
    });

    it('accepts full ISO datetime', () => {
      const field = { key: 'k', label: 'Date', type: 'date', required: true };
      expect(validateFieldValue('2024-03-15T10:30:00Z', field)).toBeNull();
    });

    it('rejects invalid date string', () => {
      const field = { key: 'k', label: 'Date', type: 'date', required: true };
      expect(validateFieldValue('not-a-date', field)).toMatch(/must be a valid ISO date/);
    });

    it('rejects non-string for date', () => {
      const field = { key: 'k', label: 'Date', type: 'date', required: true };
      expect(validateFieldValue(12345, field)).toMatch(/must be a valid ISO date/);
    });

    // ─── BOOLEAN ───
    it('accepts valid boolean', () => {
      const field = { key: 'k', label: 'Active', type: 'boolean', required: true };
      expect(validateFieldValue(true, field)).toBeNull();
      expect(validateFieldValue(false, field)).toBeNull();
    });

    it('rejects non-boolean for boolean field', () => {
      const field = { key: 'k', label: 'Active', type: 'boolean', required: true };
      expect(validateFieldValue('yes', field)).toMatch(/must be a boolean/);
    });

    // ─── SELECT ───
    it('accepts valid select value', () => {
      const field = { key: 'k', label: 'Type', type: 'select', options: ['A', 'B', 'C'] };
      expect(validateFieldValue('B', field)).toBeNull();
    });

    it('rejects select value not in options', () => {
      const field = { key: 'k', label: 'Type', type: 'select', options: ['A', 'B', 'C'] };
      expect(validateFieldValue('D', field)).toMatch(/must be one of: A, B, C/);
    });

    // ─── ENTITY_REFERENCE ───
    it('accepts valid entity reference', () => {
      const field = { key: 'k', label: 'Ref', type: 'entity-reference' };
      expect(validateFieldValue({ entityId: 'e1', entityTypeId: 'et1', workspaceId: 'ws1' }, field)).toBeNull();
    });

    it('rejects malformed entity reference', () => {
      const field = { key: 'k', label: 'Ref', type: 'entity-reference' };
      expect(validateFieldValue({ entityId: 'e1' }, field)).toMatch(/must have entityId, entityTypeId, and workspaceId/);
    });

    it('rejects non-object for entity reference', () => {
      const field = { key: 'k', label: 'Ref', type: 'entity-reference' };
      expect(validateFieldValue('not-obj', field)).toMatch(/must be an entity reference object/);
    });

    // ─── FILE_REFERENCE ───
    it('accepts valid file reference', () => {
      const field = { key: 'k', label: 'File', type: 'file-reference' };
      expect(validateFieldValue('file-123', field)).toBeNull();
    });

    it('rejects empty file reference', () => {
      const field = { key: 'k', label: 'File', type: 'file-reference', required: true };
      expect(validateFieldValue('', field)).toMatch(/is required/);
    });

    it('rejects non-string file reference', () => {
      const field = { key: 'k', label: 'File', type: 'file-reference' };
      expect(validateFieldValue(123, field)).toMatch(/must be a non-empty file ID string/);
    });

    // ─── REQUIRED ───
    it('returns null for empty optional value', () => {
      const field = { key: 'k', label: 'Opt', type: 'text', required: false };
      expect(validateFieldValue(undefined, field)).toBeNull();
      expect(validateFieldValue(null, field)).toBeNull();
    });

    it('returns error for empty required value', () => {
      const field = { key: 'k', label: 'Req', type: 'text', required: true };
      expect(validateFieldValue(undefined, field)).toMatch(/is required/);
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

    it('rejects undeclared fields', () => {
      const result = validateEntityData({ firstName: 'Ada', unknownField: 'surprise' }, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.unknownField).toMatch(/Undeclared field/);
    });

    it('validates field types (number in text field)', () => {
      const result = validateEntityData({ firstName: 42 }, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.firstName).toMatch(/must be a string/);
    });

    it('validates number field type', () => {
      const numFields = [{ key: 'count', label: 'Count', type: 'number', required: true }];
      const result = validateEntityData({ count: 'not-a-number' }, numFields);
      expect(result.valid).toBe(false);
      expect(result.errors.count).toMatch(/must be a finite number/);
    });

    it('validates boolean field type', () => {
      const boolFields = [{ key: 'active', label: 'Active', type: 'boolean', required: true }];
      const result = validateEntityData({ active: 'yes' }, boolFields);
      expect(result.valid).toBe(false);
      expect(result.errors.active).toMatch(/must be a boolean/);
    });

    it('validates date field type', () => {
      const dateFields = [{ key: 'born', label: 'Born', type: 'date', required: true }];
      const result = validateEntityData({ born: 'not-a-date' }, dateFields);
      expect(result.valid).toBe(false);
      expect(result.errors.born).toMatch(/must be a valid ISO date/);
    });

    it('validates select field value', () => {
      const selFields = [{ key: 'color', label: 'Color', type: 'select', options: ['red', 'blue'] }];
      const good = validateEntityData({ color: 'red' }, selFields);
      expect(good.valid).toBe(true);
      const bad = validateEntityData({ color: 'green' }, selFields);
      expect(bad.valid).toBe(false);
      expect(bad.errors.color).toMatch(/must be one of/);
    });
  });
});
