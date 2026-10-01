/**
 * Form Schema Validator — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { validateFormSchema, validateFormValues, extractEntityReferences } from './formSchemaValidator.js';

describe('validateFormSchema', () => {
  it('validates a well-formed schema', () => {
    const result = validateFormSchema({
      schemaVersion: '1.0.0',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'count', label: 'Count', type: 'number', required: false },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects null schema', () => {
    expect(validateFormSchema(null).valid).toBe(false);
  });

  it('rejects missing schemaVersion', () => {
    const result = validateFormSchema({ fields: [{ key: 'a', label: 'A', type: 'text' }] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Form schema version is required');
  });

  it('rejects empty fields array', () => {
    const result = validateFormSchema({ schemaVersion: '1.0.0', fields: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects non-array fields', () => {
    const result = validateFormSchema({ schemaVersion: '1.0.0', fields: 'not-array' });
    expect(result.valid).toBe(false);
  });

  it('validates entity reference fields should declare entityTypeId', () => {
    const result = validateFormSchema({
      schemaVersion: '1.0.0',
      fields: [{ key: 'room', label: 'Room', type: 'entity-reference', required: true }],
    });
    // Not invalid, but warns
    expect(result.errors.some((e) => e.includes('entityTypeId'))).toBe(true);
  });

  it('validates select options shape', () => {
    const result = validateFormSchema({
      schemaVersion: '1.0.0',
      fields: [{
        key: 'status', label: 'Status', type: 'select', required: true,
        options: [{ value: 'GOOD' }], // Missing label
      }],
    });
    expect(result.errors.some((e) => e.includes('value and label'))).toBe(true);
  });
});

describe('validateFormValues', () => {
  const fields = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'age', label: 'Age', type: 'number', required: false },
    { key: 'status', label: 'Status', type: 'select', required: true, options: ['ACTIVE', 'INACTIVE'] },
    { key: 'active', label: 'Active', type: 'boolean', required: false },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'email', label: 'Email', type: 'email', required: false },
  ];

  it('validates correct values', () => {
    const result = validateFormValues({
      name: 'John',
      status: 'ACTIVE',
      date: '2024-01-15',
    }, fields);
    expect(result.valid).toBe(true);
  });

  it('catches missing required fields', () => {
    const result = validateFormValues({}, fields);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.status).toBeTruthy();
    expect(result.errors.date).toBeTruthy();
  });

  it('catches wrong types', () => {
    const result = validateFormValues({
      name: 123,
      status: 'ACTIVE',
      date: '2024-01-15',
    }, fields);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it('catches invalid select option', () => {
    const result = validateFormValues({
      name: 'Test',
      status: 'UNKNOWN',
      date: '2024-01-15',
    }, fields);
    expect(result.valid).toBe(false);
    expect(result.errors.status).toBeTruthy();
  });

  it('rejects undeclared fields', () => {
    const result = validateFormValues({
      name: 'Test',
      status: 'ACTIVE',
      date: '2024-01-15',
      hackField: 'injected',
    }, fields);
    expect(result.valid).toBe(false);
    expect(result.errors.hackField).toContain('Undeclared');
  });

  it('validates email format', () => {
    const result = validateFormValues({
      name: 'Test',
      status: 'ACTIVE',
      date: '2024-01-15',
      email: 'not-email',
    }, fields);
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeTruthy();
  });

  it('accepts valid email', () => {
    const result = validateFormValues({
      name: 'Test',
      status: 'ACTIVE',
      date: '2024-01-15',
      email: 'test@example.com',
    }, fields);
    expect(result.valid).toBe(true);
  });
});

describe('extractEntityReferences', () => {
  const fields = [
    { key: 'room', label: 'Room', type: 'entity-reference', entityTypeId: 'ROOM' },
    { key: 'name', label: 'Name', type: 'text' },
  ];

  it('extracts entity references', () => {
    const refs = extractEntityReferences({
      room: { entityId: 'e-1', entityTypeId: 'ROOM', workspaceId: 'ws-1' },
      name: 'Test',
    }, fields);

    expect(refs).toHaveLength(1);
    expect(refs[0].entityId).toBe('e-1');
    expect(refs[0].entityTypeId).toBe('ROOM');
    expect(refs[0].workspaceId).toBe('ws-1');
  });

  it('returns empty array when no refs', () => {
    const refs = extractEntityReferences({ name: 'Test' }, fields);
    expect(refs).toHaveLength(0);
  });

  it('skips undefined entity reference values', () => {
    const refs = extractEntityReferences({ room: undefined, name: 'Test' }, fields);
    expect(refs).toHaveLength(0);
  });
});
