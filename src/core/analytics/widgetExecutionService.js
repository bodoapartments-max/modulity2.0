import { createWidgetDefinition, normalizeLegacyFilter } from '../workspace/widgetDefinition.js';

export function createWidgetExecutionService({ analyticsExecutionService }) {
  function toAnalyticsDefinition(widget) {
    const moduleIds = widget.moduleIds?.length ? widget.moduleIds : widget.moduleId ? [widget.moduleId] : [];
    if (widget.source === 'RECORDS' && moduleIds.length === 0) throw new Error('Widget must be configured with a source Module before execution');
    const metricType = typeof widget.metric === 'string' ? widget.metric : widget.metric?.type || 'COUNT';
    const groupBy = widget.type === 'STATUS_SUMMARY'
      ? [widget.groupBy || { scope: 'SYSTEM', field: 'status', type: 'text', label: 'Status' }]
      : widget.groupBy ? [widget.groupBy] : [];
    return {
      ...widget,
      dataSources: widget.source === 'RECORDS'
        ? moduleIds.map((moduleId) => ({ sourceType: widget.source, moduleId }))
        : [{ sourceType: widget.source }],
      filters: (widget.filters || []).map(normalizeLegacyFilter),
      groupBy,
      metrics: [{ type: metricType, fieldRef: widget.metricField || widget.metric?.fieldRef || null, key: 'value' }],
      columns: widget.columns || [], sort: widget.sort || [], visualization: { type: 'TABLE' },
    };
  }

  async function execute(rawWidget) {
    const widget = createWidgetDefinition(rawWidget);
    const result = await analyticsExecutionService.execute(toAnalyticsDefinition(widget));
    return Object.freeze({
      widgetId: widget.widgetId, type: widget.type, name: widget.name, executedAt: result.executedAt,
      value: result.summary.value, summary: result.summary, groups: result.groups,
      rows: widget.type === 'RECENT_RECORDS' ? result.rows.slice(0, widget.display.limit || 5) : result.rows.slice(0, widget.display.limit || 10),
      totalMatched: result.totalMatched, truncated: result.truncated,
    });
  }

  return { execute };
}
