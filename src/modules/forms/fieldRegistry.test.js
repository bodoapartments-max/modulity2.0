/**
 * Field Registry — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { getFieldComponent, FIELD_COMPONENT_MAP } from './fieldRegistry.js';
import { FIELD_TYPES } from '../../core/data/entityType.js';
import { UnsupportedField } from './fields/UnsupportedField.jsx';

describe('getFieldComponent', () => {
  it('returns a component for every supported FIELD_TYPE', () => {
    const supported = [
      FIELD_TYPES.TEXT,
      FIELD_TYPES.TEXTAREA,
      FIELD_TYPES.NUMBER,
      FIELD_TYPES.DATE,
      FIELD_TYPES.DATETIME,
      FIELD_TYPES.DATE_RANGE,
      FIELD_TYPES.DATETIME_RANGE,
      FIELD_TYPES.BOOLEAN,
      FIELD_TYPES.SELECT,
      FIELD_TYPES.EMAIL,
      FIELD_TYPES.PHONE,
      FIELD_TYPES.URL,
      FIELD_TYPES.ENTITY_REFERENCE,
      FIELD_TYPES.FILE_REFERENCE,
    ];

    for (const type of supported) {
      const component = getFieldComponent(type);
      expect(component).toBeDefined();
      expect(component).not.toBe(UnsupportedField);
    }
  });

  it('returns UnsupportedField for unknown types', () => {
    expect(getFieldComponent('unknown-type')).toBe(UnsupportedField);
    expect(getFieldComponent('rich-text')).toBe(UnsupportedField);
    expect(getFieldComponent('')).toBe(UnsupportedField);
  });

  it('has exactly 14 registered field types', () => {
    expect(Object.keys(FIELD_COMPONENT_MAP)).toHaveLength(14);
  });
});
