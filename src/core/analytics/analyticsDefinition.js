export const ANALYTICS_SOURCES = Object.freeze({ RECORDS: 'RECORDS', ENTITIES: 'ENTITIES', RELATIONSHIPS: 'RELATIONSHIPS' });
export const FIELD_SCOPES = Object.freeze({ SYSTEM: 'SYSTEM', DATA: 'DATA', ENTITY: 'ENTITY' });
export const FIELD_TYPES = Object.freeze({ TEXT: 'text', NUMBER: 'number', DATE: 'date', DATETIME: 'datetime', BOOLEAN: 'boolean', ENTITY_REFERENCE: 'entity-reference' });
export const FILTER_OPERATORS = Object.freeze({ EQUALS: 'EQUALS', NOT_EQUALS: 'NOT_EQUALS', IN: 'IN', NOT_IN: 'NOT_IN', GREATER_THAN: 'GREATER_THAN', GREATER_THAN_OR_EQUAL: 'GREATER_THAN_OR_EQUAL', LESS_THAN: 'LESS_THAN', LESS_THAN_OR_EQUAL: 'LESS_THAN_OR_EQUAL', BETWEEN: 'BETWEEN', IS_EMPTY: 'IS_EMPTY', IS_NOT_EMPTY: 'IS_NOT_EMPTY', CONTAINS: 'CONTAINS', STARTS_WITH: 'STARTS_WITH' });
export const METRIC_TYPES = Object.freeze({ COUNT: 'COUNT', COUNT_DISTINCT: 'COUNT_DISTINCT', SUM: 'SUM', AVERAGE: 'AVERAGE', MIN: 'MIN', MAX: 'MAX' });
export const VISUALIZATION_TYPES = Object.freeze({ TABLE: 'TABLE', BAR: 'BAR', LINE: 'LINE', DONUT: 'DONUT' });
export const DATE_PERIODS = Object.freeze({ CUSTOM: 'CUSTOM', TODAY: 'TODAY', THIS_WEEK: 'THIS_WEEK', THIS_MONTH: 'THIS_MONTH', THIS_QUARTER: 'THIS_QUARTER', THIS_YEAR: 'THIS_YEAR' });
export const ANALYTICS_BOUNDS = Object.freeze({ MAX_SOURCE_MODULES: 5, MAX_SOURCE_RECORDS: 500, MAX_ROWS: 100, MAX_GROUPS: 100, MAX_FILTERS: 10, MAX_METRICS: 8, MAX_COLUMNS: 12, MAX_WIDGET_RECORDS: 100 });

export const SYSTEM_FIELDS = Object.freeze({
  recordId: { label: 'Record ID', type: FIELD_TYPES.TEXT },
  moduleId: { label: 'Module', type: FIELD_TYPES.TEXT },
  moduleVersion: { label: 'Module Version', type: FIELD_TYPES.NUMBER },
  recordType: { label: 'Record Type', type: FIELD_TYPES.TEXT },
  status: { label: 'Status', type: FIELD_TYPES.TEXT },
  priority: { label: 'Priority', type: FIELD_TYPES.TEXT },
  createdAt: { label: 'Created', type: FIELD_TYPES.DATETIME },
  updatedAt: { label: 'Updated', type: FIELD_TYPES.DATETIME },
  submittedAt: { label: 'Submitted', type: FIELD_TYPES.DATETIME },
  'createdBy.actorId': { label: 'Created By', type: FIELD_TYPES.TEXT },
});

const NUMERIC_METRICS = new Set([METRIC_TYPES.SUM, METRIC_TYPES.AVERAGE, METRIC_TYPES.MIN, METRIC_TYPES.MAX]);
const RANGE_OPERATORS = new Set([FILTER_OPERATORS.GREATER_THAN, FILTER_OPERATORS.GREATER_THAN_OR_EQUAL, FILTER_OPERATORS.LESS_THAN, FILTER_OPERATORS.LESS_THAN_OR_EQUAL, FILTER_OPERATORS.BETWEEN]);

export function createFieldReference({ scope, field, type, label = null, moduleId = null }) {
  if (!Object.values(FIELD_SCOPES).includes(scope)) throw new Error('Invalid field scope');
  if (!field || typeof field !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field)) throw new Error('Invalid field reference');
  if (!Object.values(FIELD_TYPES).includes(type)) throw new Error('Invalid field type');
  if (scope === FIELD_SCOPES.SYSTEM && !SYSTEM_FIELDS[field]) throw new Error(`Unsupported system field: ${field}`);
  return Object.freeze({ scope, field, type, label: label || SYSTEM_FIELDS[field]?.label || field, moduleId });
}

export function validateFilter(filter) {
  createFieldReference(filter.fieldRef);
  if (!Object.values(FILTER_OPERATORS).includes(filter.operator)) throw new Error(`Unsupported filter operator: ${filter.operator}`);
  if (RANGE_OPERATORS.has(filter.operator) && ![FIELD_TYPES.NUMBER, FIELD_TYPES.DATE, FIELD_TYPES.DATETIME].includes(filter.fieldRef.type)) throw new Error('Range filter requires numeric or date field');
  if ([FILTER_OPERATORS.CONTAINS, FILTER_OPERATORS.STARTS_WITH].includes(filter.operator) && filter.fieldRef.type !== FIELD_TYPES.TEXT) throw new Error('Text filter requires text field');
  if ([FILTER_OPERATORS.IN, FILTER_OPERATORS.NOT_IN].includes(filter.operator) && (!Array.isArray(filter.value) || filter.value.length > 10)) throw new Error('IN filter requires at most 10 values');
  if (filter.operator === FILTER_OPERATORS.BETWEEN && (!Array.isArray(filter.value) || filter.value.length !== 2)) throw new Error('BETWEEN requires two values');
  return true;
}

export function validateMetric(metric) {
  if (!Object.values(METRIC_TYPES).includes(metric.type)) throw new Error(`Unsupported metric: ${metric.type}`);
  if (metric.type !== METRIC_TYPES.COUNT) createFieldReference(metric.fieldRef);
  if (NUMERIC_METRICS.has(metric.type) && metric.fieldRef?.type !== FIELD_TYPES.NUMBER) throw new Error(`${metric.type} requires numeric field`);
  return true;
}

export function validateAnalyticsDefinition({ dataSources, filters = [], groupBy = [], metrics = [], columns = [], sort = [], visualization = { type: 'TABLE' } }) {
  if (!Array.isArray(dataSources) || dataSources.length === 0) throw new Error('At least one data source is required');
  if (dataSources.length > ANALYTICS_BOUNDS.MAX_SOURCE_MODULES) throw new Error('Too many data sources');
  for (const source of dataSources) {
    if (!Object.values(ANALYTICS_SOURCES).includes(source.sourceType)) throw new Error(`Unsupported source type: ${source.sourceType}`);
    if (source.sourceType === ANALYTICS_SOURCES.RECORDS && !source.moduleId) throw new Error('Record source requires moduleId');
  }
  if (filters.length > ANALYTICS_BOUNDS.MAX_FILTERS || metrics.length > ANALYTICS_BOUNDS.MAX_METRICS || columns.length > ANALYTICS_BOUNDS.MAX_COLUMNS || groupBy.length > 2 || sort.length > 3) throw new Error('Analytics definition exceeds bounds');
  filters.forEach(validateFilter);
  metrics.forEach(validateMetric);
  groupBy.forEach(createFieldReference);
  columns.forEach(createFieldReference);
  sort.forEach((item) => { createFieldReference(item.fieldRef); if (!['asc', 'desc'].includes(item.direction)) throw new Error('Invalid sort direction'); });
  if (!Object.values(VISUALIZATION_TYPES).includes(visualization.type)) throw new Error('Unsupported visualization');
  return true;
}
