import { createActorRef } from '../data/actorRef.js';
import { ANALYTICS_BOUNDS, ANALYTICS_SOURCES, METRIC_TYPES, SYSTEM_FIELDS, validateAnalyticsDefinition, validateFilter } from '../analytics/analyticsDefinition.js';

export const WIDGET_TYPES = Object.freeze({ KPI: 'KPI', STATUS_SUMMARY: 'STATUS_SUMMARY', RECENT_RECORDS: 'RECENT_RECORDS', ASSIGNMENT: 'ASSIGNMENT', TABLE: 'TABLE' });
export const WIDGET_SOURCES = ANALYTICS_SOURCES;
export const WIDGET_SIZES = Object.freeze({ SMALL: 'SMALL', MEDIUM: 'MEDIUM', LARGE: 'LARGE' });
export const WIDGET_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });

function normalizeLegacyFilter(filter) {
  if (filter.fieldRef) return filter;
  if (!SYSTEM_FIELDS[filter.field]) throw new Error(`Unsupported Record filter field: ${filter.field}`);
  const operatorMap = { '==': 'EQUALS', '!=': 'NOT_EQUALS', IN: 'IN' };
  return { fieldRef: { scope: 'SYSTEM', field: filter.field, type: 'text', label: filter.field }, operator: operatorMap[filter.operator] || filter.operator, value: filter.value };
}

export function validateWidgetQuery({ source, filters = [], limit = 10, moduleId = null, moduleIds = [], metric = 'COUNT', metricField = null, groupBy = null, columns = [] }) {
  if (!Object.values(WIDGET_SOURCES).includes(source)) throw new Error('Unsupported Widget source');
  if (!Number.isInteger(limit) || limit < 1 || limit > ANALYTICS_BOUNDS.MAX_WIDGET_RECORDS) throw new Error(`Widget query limit must be between 1 and ${ANALYTICS_BOUNDS.MAX_WIDGET_RECORDS}`);
  const normalizedFilters = filters.map(normalizeLegacyFilter);
  const resolvedModuleIds = [...new Set([...(moduleIds || []), ...(moduleId ? [moduleId] : [])])];
  if (source === WIDGET_SOURCES.RECORDS && resolvedModuleIds.length === 0) {
    normalizedFilters.forEach(validateFilter);
    if ((typeof metric === 'string' ? metric : metric.type) !== METRIC_TYPES.COUNT) throw new Error('Legacy workspace-wide Widget only supports COUNT');
    return true;
  }
  const metrics = [{ type: typeof metric === 'string' ? metric : metric.type, fieldRef: metricField || metric.fieldRef || null, key: 'value' }];
  validateAnalyticsDefinition({
    dataSources: source === 'RECORDS'
      ? resolvedModuleIds.map((id) => ({ sourceType: source, moduleId: id }))
      : [{ sourceType: source }],
    filters: normalizedFilters, groupBy: groupBy ? [groupBy] : [], metrics,
    columns, sort: [], visualization: { type: 'TABLE' },
  });
  return true;
}

export function createWidgetDefinition({
  widgetId, workspaceId, ownerUserId, name, type, source = WIDGET_SOURCES.RECORDS,
  moduleId = null, moduleIds = [], recordType = null, filters = [], metric = METRIC_TYPES.COUNT, metricField = null,
  groupBy = null, columns = [], sort = [], display = {}, size = WIDGET_SIZES.MEDIUM,
  status = WIDGET_STATUSES.ACTIVE, createdBy, createdAt = null, updatedAt = null,
}) {
  if (!widgetId || !workspaceId || !ownerUserId) throw new Error('Widget identity is required');
  if (!name?.trim()) throw new Error('Widget name is required');
  if (!Object.values(WIDGET_TYPES).includes(type)) throw new Error('Unsupported Widget type');
  if (!Object.values(WIDGET_SIZES).includes(size)) throw new Error('Unsupported Widget size');
  if (!Object.values(WIDGET_STATUSES).includes(status)) throw new Error('Unsupported Widget status');
  validateWidgetQuery({ source, filters, limit: display.limit || 10, moduleId, moduleIds, metric, metricField, groupBy, columns });
  createActorRef(createdBy);
  return Object.freeze({
    widgetId, workspaceId, ownerUserId, name: name.trim(), type, source, moduleId,
    moduleIds: Object.freeze([...new Set([...(moduleIds || []), ...(moduleId ? [moduleId] : [])])]), recordType,
    filters: Object.freeze(filters.map((filter) => Object.freeze({ ...filter, ...(filter.fieldRef ? { fieldRef: Object.freeze({ ...filter.fieldRef }) } : {}) }))),
    metric: typeof metric === 'object' ? Object.freeze({ ...metric }) : metric,
    metricField: metricField ? Object.freeze({ ...metricField }) : null,
    groupBy: groupBy ? Object.freeze({ ...groupBy }) : null,
    columns: Object.freeze(columns.map((column) => Object.freeze({ ...column }))),
    sort: Object.freeze(sort.map((item) => Object.freeze({ ...item }))),
    display: Object.freeze({ ...display }), size, status,
    createdBy: Object.freeze({ ...createdBy }), createdAt, updatedAt,
  });
}

export { normalizeLegacyFilter };
