import { createActorRef } from '../data/actorRef.js';

export const WIDGET_TYPES = Object.freeze({ KPI: 'KPI', STATUS_SUMMARY: 'STATUS_SUMMARY', RECENT_RECORDS: 'RECENT_RECORDS', ASSIGNMENT: 'ASSIGNMENT', TABLE: 'TABLE' });
export const WIDGET_SOURCES = Object.freeze({ RECORDS: 'RECORDS', RELATIONSHIPS: 'RELATIONSHIPS' });
export const WIDGET_SIZES = Object.freeze({ SMALL: 'SMALL', MEDIUM: 'MEDIUM', LARGE: 'LARGE' });
export const WIDGET_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });
export const WIDGET_OPERATORS = Object.freeze(['==', '!=', 'IN']);
const ALLOWED_RECORD_FIELDS = new Set(['status', 'priority', 'moduleId', 'recordType', 'createdBy.actorId']);

export function validateWidgetQuery({ source, filters = [], limit = 10 }) {
  if (!Object.values(WIDGET_SOURCES).includes(source)) throw new Error('Unsupported Widget source');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Widget query limit must be between 1 and 50');
  if (!Array.isArray(filters) || filters.length > 5) throw new Error('Widget filters must contain at most 5 filters');
  for (const filter of filters) {
    if (!WIDGET_OPERATORS.includes(filter.operator)) throw new Error('Unsupported Widget filter operator');
    if (source === WIDGET_SOURCES.RECORDS && !ALLOWED_RECORD_FIELDS.has(filter.field)) throw new Error('Unsupported Record filter field');
    if (filter.operator === 'IN' && (!Array.isArray(filter.value) || filter.value.length > 10)) throw new Error('IN filter requires at most 10 values');
  }
  return true;
}

export function createWidgetDefinition({
  widgetId, workspaceId, ownerUserId, name, type, source = WIDGET_SOURCES.RECORDS,
  moduleId = null, recordType = null, filters = [], metric = 'COUNT', groupBy = null,
  display = {}, size = WIDGET_SIZES.MEDIUM, status = WIDGET_STATUSES.ACTIVE,
  createdBy, createdAt = null, updatedAt = null,
}) {
  if (!widgetId || !workspaceId || !ownerUserId) throw new Error('Widget identity is required');
  if (!name?.trim()) throw new Error('Widget name is required');
  if (!Object.values(WIDGET_TYPES).includes(type)) throw new Error('Unsupported Widget type');
  if (!Object.values(WIDGET_SIZES).includes(size)) throw new Error('Unsupported Widget size');
  if (!Object.values(WIDGET_STATUSES).includes(status)) throw new Error('Unsupported Widget status');
  validateWidgetQuery({ source, filters, limit: display.limit || 10 });
  createActorRef(createdBy);
  return Object.freeze({
    widgetId, workspaceId, ownerUserId, name: name.trim(), type, source, moduleId, recordType,
    filters: Object.freeze(filters.map((filter) => Object.freeze({ ...filter }))), metric, groupBy,
    display: Object.freeze({ ...display }), size, status,
    createdBy: Object.freeze({ ...createdBy }), createdAt, updatedAt,
  });
}
