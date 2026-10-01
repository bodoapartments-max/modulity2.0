import { describe, it, expect } from 'vitest';
import { CORE_ENTITY_TYPES, getCoreEntityType } from './coreEntityTypes.js';
import { ENTITY_TYPE_CATEGORIES, ENTITY_TYPE_STATUSES } from './entityType.js';

describe('coreEntityTypes', () => {
  const standardCodes = ['PERSON', 'EMPLOYEE', 'CUSTOMER', 'SUPPLIER', 'VEHICLE', 'EQUIPMENT', 'LOCATION', 'DOCUMENT'];

  it('defines all 8 core types', () => {
    const codes = CORE_ENTITY_TYPES.map((t) => t.code);
    expect(CORE_ENTITY_TYPES).toHaveLength(8);
    expect(codes).toEqual(expect.arrayContaining(standardCodes));
  });

  it('marks all core types as CORE category', () => {
    for (const type of CORE_ENTITY_TYPES) {
      expect(type.category).toBe(ENTITY_TYPE_CATEGORIES.CORE);
    }
  });

  it('marks all core types as ACTIVE', () => {
    for (const type of CORE_ENTITY_TYPES) {
      expect(type.status).toBe(ENTITY_TYPE_STATUSES.ACTIVE);
    }
  });

  it('gives every core type a non-empty fields array', () => {
    for (const type of CORE_ENTITY_TYPES) {
      expect(Array.isArray(type.fields)).toBe(true);
      expect(type.fields.length).toBeGreaterThan(0);
    }
  });

  it('uses the standard codes', () => {
    const codes = CORE_ENTITY_TYPES.map((t) => t.code);
    for (const code of standardCodes) {
      expect(codes).toContain(code);
    }
  });

  it('finds a core type by code', () => {
    const person = getCoreEntityType('PERSON');
    expect(person).toBeDefined();
    expect(person.code).toBe('PERSON');
    expect(person.name).toBe('Person');
  });

  it('returns null for an unknown code', () => {
    expect(getCoreEntityType('UNKNOWN')).toBeNull();
  });
});
