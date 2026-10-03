export function pluralizeEntityType(name) {
  if (!name) return 'Entities';
  if (name.toLowerCase() === 'equipment') return name;
  if (name.toLowerCase() === 'person') return 'People';
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

export function sortEntityTypes(entityTypes) {
  return [...entityTypes].sort((left, right) => (left.category === right.category ? left.name.localeCompare(right.name) : left.category === 'CORE' ? -1 : 1));
}

export function orderedEntityDataFields(entityType, data = {}) {
  const known = (entityType?.fields || []).filter((field) => Object.prototype.hasOwnProperty.call(data, field.key));
  const knownKeys = new Set(known.map((field) => field.key));
  const unknown = Object.keys(data).filter((key) => !knownKeys.has(key)).sort().map((key) => ({ key, label: key, type: 'text', required: false }));
  return [...known, ...unknown];
}

export function buildEntityListColumns(entityType) {
  return Object.freeze([...(entityType?.fields || []).slice(0, 4).map((field) => Object.freeze({ key: field.key, label: field.label, type: field.type, scope: 'DATA' })), Object.freeze({ key: 'status', label: 'Status', scope: 'SYSTEM' })]);
}

export function formatEntityListValue(entity, column, entityLabels = {}) {
  const value = column.scope === 'DATA' ? entity.data?.[column.key] : entity[column.key];
  if (value === undefined || value === null || value === '') return '—';
  if (column.type === 'entity-reference' && typeof value === 'object') return entityLabels[value.entityId] || value.entityId;
  if (column.type === 'boolean') return value ? 'Yes' : 'No';
  if (column.type === 'date' || column.type === 'datetime') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
