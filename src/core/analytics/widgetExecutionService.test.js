import { describe, expect, it, vi } from 'vitest';
import { createWidgetExecutionService } from './widgetExecutionService.js';

const actor = { actorType: 'USER', actorId: 'u1' };
const base = { widgetId: 'w1', workspaceId: 'ws1', ownerUserId: 'u1', name: 'Widget', source: 'RECORDS', moduleId: 'm1', filters: [], metric: 'COUNT', columns: [], display: { limit: 10 }, createdBy: actor };
const executionResult = { executedAt: '2026-01-01T00:00:00Z', summary: { value: 3 }, groups: [{ key: 'OPEN', count: 3, metrics: { value: 3 } }], rows: [{ recordId: 'r1', values: { status: 'OPEN' } }], totalMatched: 3, truncated: false };

function service() {
  const analyticsExecutionService = { execute: vi.fn().mockResolvedValue(executionResult) };
  return { service: createWidgetExecutionService({ analyticsExecutionService }), analyticsExecutionService };
}

describe('WidgetExecutionService', () => {
  for (const type of ['KPI', 'STATUS_SUMMARY', 'RECENT_RECORDS', 'TABLE']) {
    it(`executes ${type} through shared analytics`, async () => {
      const { service: widgetService, analyticsExecutionService } = service();
      const result = await widgetService.execute({ ...base, type, ...(type === 'STATUS_SUMMARY' ? { groupBy: { scope: 'SYSTEM', field: 'status', type: 'text', label: 'Status' } } : {}) });
      expect(result.type).toBe(type);
      expect(result.value).toBe(3);
      expect(analyticsExecutionService.execute).toHaveBeenCalledOnce();
    });
  }

  it('executes ASSIGNMENT from canonical Relationships', async () => {
    const { service: widgetService, analyticsExecutionService } = service();
    await widgetService.execute({ ...base, type: 'ASSIGNMENT', source: 'RELATIONSHIPS', moduleId: null, moduleIds: [], columns: [{ scope: 'ENTITY', field: 'source.objectId', type: 'entity-reference', label: 'Source' }] });
    expect(analyticsExecutionService.execute.mock.calls[0][0].dataSources).toEqual([{ sourceType: 'RELATIONSHIPS' }]);
  });

  it('rejects an unconfigured legacy Record Widget safely', async () => {
    const { service: widgetService } = service();
    await expect(widgetService.execute({ ...base, type: 'KPI', moduleId: null, moduleIds: [] })).rejects.toThrow('source Module');
  });
});
