import { describe, expect, it } from 'vitest';
import { buildEntityListColumns, formatEntityListValue, orderedEntityDataFields, pluralizeEntityType, sortEntityTypes } from './entityPresentation.js';

describe('generic Entity presentation', () => {
  it('pluralizes common Entity Type names without business-specific branches', () => {
    expect(pluralizeEntityType('Employee')).toBe('Employees');
    expect(pluralizeEntityType('Category')).toBe('Categories');
    expect(pluralizeEntityType('Class')).toBe('Classes');
    expect(pluralizeEntityType('Equipment')).toBe('Equipment');
    expect(pluralizeEntityType('Person')).toBe('People');
  });

  it('stabilizes Entity Type cards and Entity Detail fields', () => {
    expect(sortEntityTypes([{ name: 'Room', category: 'DOMAIN' }, { name: 'Vehicle', category: 'CORE' }, { name: 'Employee', category: 'CORE' }]).map((item) => item.name)).toEqual(['Employee', 'Vehicle', 'Room']);
    const fields = [{ key: 'firstName', label: 'First Name', type: 'text' }, { key: 'lastName', label: 'Last Name', type: 'text' }, { key: 'position', label: 'Position', type: 'text' }];
    expect(orderedEntityDataFields({ fields }, { position: 'Manager', firstName: 'Anna', legacy: 'value', lastName: 'Smith' }).map((field) => field.key)).toEqual(['firstName', 'lastName', 'position', 'legacy']);
  });

  it('derives bounded columns from any Entity Type schema', () => {
    const columns = buildEntityListColumns({ fields: Array.from({ length: 6 }, (_, index) => ({ key: `field${index}`, label: `Field ${index}`, type: 'text' })) });
    expect(columns.map((item) => item.key)).toEqual(['field0', 'field1', 'field2', 'field3', 'status']);
  });

  it('formats EntityReference labels without changing canonical data', () => {
    const reference = { entityId: 'employee-1', entityTypeId: 'core:employee', workspaceId: 'workspace-1' };
    const entity = { data: { manager: reference } };
    expect(formatEntityListValue(entity, { key: 'manager', scope: 'DATA', type: 'entity-reference' }, { 'employee-1': 'Anna Smith' })).toBe('Anna Smith');
    expect(entity.data.manager).toBe(reference);
  });
});
