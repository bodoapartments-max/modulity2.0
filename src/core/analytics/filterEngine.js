import { DATE_PERIODS, FILTER_OPERATORS } from './analyticsDefinition.js';

export function readFieldValue(item, fieldRef) {
  const root = fieldRef.scope === 'DATA' ? item.data : item;
  return fieldRef.field.split('.').reduce((value, key) => value == null ? undefined : value[key], root);
}

export function isEmptyValue(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function comparable(value, type) {
  if (value == null) return value;
  if (type === 'number') return typeof value === 'number' ? value : Number(value);
  if (type === 'date' || type === 'datetime') return new Date(value).getTime();
  if (type === 'entity-reference') return typeof value === 'object' ? value.entityId : value;
  return value;
}

export function matchesFilter(item, filter) {
  const raw = readFieldValue(item, filter.fieldRef);
  const value = comparable(raw, filter.fieldRef.type);
  const expected = Array.isArray(filter.value) ? filter.value.map((entry) => comparable(entry, filter.fieldRef.type)) : comparable(filter.value, filter.fieldRef.type);
  switch (filter.operator) {
    case FILTER_OPERATORS.EQUALS: return value === expected;
    case FILTER_OPERATORS.NOT_EQUALS: return value !== expected;
    case FILTER_OPERATORS.IN: return expected.includes(value);
    case FILTER_OPERATORS.NOT_IN: return !expected.includes(value);
    case FILTER_OPERATORS.GREATER_THAN: return value > expected;
    case FILTER_OPERATORS.GREATER_THAN_OR_EQUAL: return value >= expected;
    case FILTER_OPERATORS.LESS_THAN: return value < expected;
    case FILTER_OPERATORS.LESS_THAN_OR_EQUAL: return value <= expected;
    case FILTER_OPERATORS.BETWEEN: return value >= expected[0] && value <= expected[1];
    case FILTER_OPERATORS.IS_EMPTY: return isEmptyValue(raw);
    case FILTER_OPERATORS.IS_NOT_EMPTY: return !isEmptyValue(raw);
    case FILTER_OPERATORS.CONTAINS: return typeof raw === 'string' && raw.toLocaleLowerCase().includes(String(filter.value).toLocaleLowerCase());
    case FILTER_OPERATORS.STARTS_WITH: return typeof raw === 'string' && raw.toLocaleLowerCase().startsWith(String(filter.value).toLocaleLowerCase());
    default: return false;
  }
}

export function applyFilters(items, filters = []) {
  return items.filter((item) => filters.every((filter) => matchesFilter(item, filter)));
}

export function resolveDatePeriod(period, now = new Date()) {
  if (!period || period.type === DATE_PERIODS.CUSTOM) return period?.from && period?.to ? { from: period.from, to: period.to } : null;
  const date = new Date(now);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  if (period.type === DATE_PERIODS.TODAY) end.setUTCDate(end.getUTCDate() + 1);
  if (period.type === DATE_PERIODS.THIS_WEEK) { const day = (start.getUTCDay() + 6) % 7; start.setUTCDate(start.getUTCDate() - day); end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 7); }
  if (period.type === DATE_PERIODS.THIS_MONTH) { start.setUTCDate(1); end.setTime(start.getTime()); end.setUTCMonth(end.getUTCMonth() + 1); }
  if (period.type === DATE_PERIODS.THIS_QUARTER) { start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1); end.setTime(start.getTime()); end.setUTCMonth(end.getUTCMonth() + 3); }
  if (period.type === DATE_PERIODS.THIS_YEAR) { start.setUTCMonth(0, 1); end.setTime(start.getTime()); end.setUTCFullYear(end.getUTCFullYear() + 1); }
  return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
}
