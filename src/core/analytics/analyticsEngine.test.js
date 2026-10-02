import { describe, expect, it } from 'vitest';
import { createFieldReference, validateAnalyticsDefinition } from './analyticsDefinition.js';
import { applyFilters, isEmptyValue, resolveDatePeriod } from './filterEngine.js';
import { aggregate, groupAndAggregate } from './aggregationEngine.js';
import { createAnalyticsExecutionService } from './analyticsExecutionService.js';
import { createReportDefinition } from './reportDefinition.js';

const amount = createFieldReference({ scope: 'DATA', field: 'amount', type: 'number', label: 'Amount' });
const category = createFieldReference({ scope: 'DATA', field: 'category', type: 'text', label: 'Category' });
const status = createFieldReference({ scope: 'SYSTEM', field: 'status', type: 'text', label: 'Status' });
const actor = { actorType: 'USER', actorId: 'u1' };
const records = [
  { recordId: 'r1', moduleId: 'hotel', moduleVersion: 1, status: 'SUBMITTED', createdAt: '2026-09-01T00:00:00Z', data: { amount: 300, category: 'Hotel' } },
  { recordId: 'r2', moduleId: 'parking', moduleVersion: 2, status: 'SUBMITTED', createdAt: '2026-09-02T00:00:00Z', data: { amount: 40, category: 'Parking' } },
  { recordId: 'r3', moduleId: 'meal', moduleVersion: 1, status: 'DRAFT', createdAt: '2026-09-03T00:00:00Z', data: { amount: 60, category: 'Meal' } },
  { recordId: 'r4', moduleId: 'meal', moduleVersion: 2, status: 'SUBMITTED', createdAt: '2026-09-04T00:00:00Z', data: { category: 'Meal' } },
];

describe('analytics primitives', () => {
  it('validates controlled field references and rejects arbitrary paths/operators', () => {
    expect(() => createFieldReference({ scope: 'SYSTEM', field: 'unknown', type: 'text' })).toThrow('Unsupported');
    expect(() => validateAnalyticsDefinition({ dataSources: [{ sourceType: 'CUSTOM_PATH', moduleId: 'x' }] })).toThrow('Unsupported source');
  });
  it('filters typed values and distinguishes missing, zero, and false', () => {
    expect(applyFilters(records, [{ fieldRef: amount, operator: 'GREATER_THAN', value: 50 }])).toHaveLength(2);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });
  it('supports controlled equality, set, range, empty and text operators', () => {
    expect(applyFilters(records, [{ fieldRef: status, operator: 'EQUALS', value: 'SUBMITTED' }])).toHaveLength(3);
    expect(applyFilters(records, [{ fieldRef: status, operator: 'NOT_EQUALS', value: 'SUBMITTED' }])).toHaveLength(1);
    expect(applyFilters(records, [{ fieldRef: category, operator: 'IN', value: ['Hotel', 'Meal'] }])).toHaveLength(3);
    expect(applyFilters(records, [{ fieldRef: amount, operator: 'BETWEEN', value: [40, 100] }])).toHaveLength(2);
    expect(applyFilters(records, [{ fieldRef: category, operator: 'STARTS_WITH', value: 'par' }])).toHaveLength(1);
    expect(applyFilters(records, [{ fieldRef: amount, operator: 'IS_EMPTY', value: null }])).toHaveLength(1);
  });

  it('resolves UTC relative date periods deterministically', () => {
    expect(resolveDatePeriod({ type: 'THIS_MONTH' }, new Date('2026-09-17T12:00:00Z'))).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T23:59:59.999Z' });
  });
  it('calculates COUNT, distinct, sum, average, min and max with missing values ignored', () => {
    expect(aggregate(records, [
      { key: 'count', type: 'COUNT' }, { key: 'distinct', type: 'COUNT_DISTINCT', fieldRef: category },
      { key: 'sum', type: 'SUM', fieldRef: amount }, { key: 'avg', type: 'AVERAGE', fieldRef: amount },
      { key: 'min', type: 'MIN', fieldRef: amount }, { key: 'max', type: 'MAX', fieldRef: amount },
    ])).toEqual({ count: 4, distinct: 3, sum: 400, avg: 400 / 3, min: 40, max: 300 });
  });
  it('groups deterministically', () => {
    expect(groupAndAggregate(records, [status], [{ key: 'count', type: 'COUNT' }])).toEqual([
      { key: 'SUBMITTED', count: 3, metrics: { count: 3 } },
      { key: 'DRAFT', count: 1, metrics: { count: 1 } },
    ]);
  });
});

describe('multi-Module report execution', () => {
  function service(sourceRecords = records, entityRepo = { listByWorkspace: async () => [], getManyByIds: async () => [] }) {
    return createAnalyticsExecutionService({
      recordRepo: { paginatedQuery: async () => ({ items: sourceRecords, hasMore: false, nextCursor: null }) },
      moduleRepo: { getById: async (_ws, id) => ({ moduleId: id, status: 'ACTIVE', formSchema: { fields: [{ key: 'amount', type: 'number' }, { key: 'category', type: 'text' }, { key: 'vehicle', type: 'entity-reference' }] } }) },
      entityRepo,
      relationshipRepo: { listByWorkspace: async () => [] },
    });
  }
  function definition(overrides = {}) {
    return createReportDefinition({
      reportId: 'rep1', workspaceId: 'ws1', name: 'Trip Summary', createdBy: actor,
      dataSources: ['hotel', 'parking', 'meal'].map((moduleId) => ({ sourceType: 'RECORDS', moduleId })),
      filters: [], groupBy: [category], metrics: [{ key: 'total', type: 'SUM', fieldRef: amount }, { key: 'count', type: 'COUNT' }],
      columns: [category, amount], sort: [], visualization: { type: 'BAR' }, ...overrides,
    });
  }
  it('combines canonical Records without modifying them and preserves Module/version provenance', async () => {
    const result = await service().execute(definition());
    expect(result.summary).toEqual({ total: 400, count: 4 });
    expect(result.rows.map((row) => row.moduleId)).toEqual(['hotel', 'parking', 'meal', 'meal']);
    expect(result.rows[1].moduleVersion).toBe(2);
    expect(records[0].data.amount).toBe(300);
  });
  it('handles fields missing from historical versions as null', async () => {
    const result = await service().execute(definition());
    expect(result.rows[3].values.amount).toBeNull();
  });
  it('resolves EntityReference labels in one batched repository call', async () => {
    const entityRef = createFieldReference({ scope: 'DATA', field: 'vehicle', type: 'entity-reference', label: 'Vehicle' });
    const getManyByIds = async (_workspaceId, ids) => ids.map((entityId) => ({ entityId, displayName: 'Vehicle 01' }));
    const source = [{ ...records[0], data: { ...records[0].data, vehicle: { entityId: 'vehicle-1', entityTypeId: 'vehicle' } } }];
    const result = await service(source, { listByWorkspace: async () => [], getManyByIds }).execute(definition({ columns: [entityRef] }));
    expect(result.rows[0].values.vehicle).toEqual({ entityId: 'vehicle-1', displayName: 'Vehicle 01' });
  });

  it('returns explicit LIMIT_EXCEEDED instead of silently truncating source data', async () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ ...records[0], recordId: `r${index}` }));
    await expect(service(many).execute(definition())).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });
});
