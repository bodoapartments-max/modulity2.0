import { ANALYTICS_BOUNDS, METRIC_TYPES } from './analyticsDefinition.js';
import { readFieldValue } from './filterEngine.js';

export function calculateMetric(items, metric) {
  if (metric.type === METRIC_TYPES.COUNT) return items.length;
  const values = items.map((item) => readFieldValue(item, metric.fieldRef)).filter((value) => value !== null && value !== undefined && value !== '');
  if (metric.type === METRIC_TYPES.COUNT_DISTINCT) return new Set(values.map((value) => typeof value === 'object' ? value.entityId || JSON.stringify(value) : value)).size;
  const numbers = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length === 0) return null;
  if (metric.type === METRIC_TYPES.SUM) return numbers.reduce((sum, value) => sum + value, 0);
  if (metric.type === METRIC_TYPES.AVERAGE) return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (metric.type === METRIC_TYPES.MIN) return Math.min(...numbers);
  if (metric.type === METRIC_TYPES.MAX) return Math.max(...numbers);
  return null;
}

export function aggregate(items, metrics = []) {
  return Object.fromEntries(metrics.map((metric, index) => [metric.key || `${metric.type.toLowerCase()}_${index}`, calculateMetric(items, metric)]));
}

function groupKey(item, fieldRefs) {
  return fieldRefs.map((fieldRef) => {
    const value = readFieldValue(item, fieldRef);
    if (value === null || value === undefined || value === '') return '(Missing)';
    if (typeof value === 'object') return value.entityId || JSON.stringify(value);
    return String(value);
  }).join(' · ');
}

export function groupAndAggregate(items, groupBy = [], metrics = []) {
  if (groupBy.length === 0) return [];
  const grouped = new Map();
  for (const item of items) {
    const key = groupKey(item, groupBy);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
    if (grouped.size > ANALYTICS_BOUNDS.MAX_GROUPS) {
      const error = new Error(`Group count exceeds ${ANALYTICS_BOUNDS.MAX_GROUPS}`);
      error.code = 'LIMIT_EXCEEDED';
      throw error;
    }
  }
  return [...grouped.entries()].map(([key, groupItems]) => ({ key, count: groupItems.length, metrics: aggregate(groupItems, metrics) }));
}
