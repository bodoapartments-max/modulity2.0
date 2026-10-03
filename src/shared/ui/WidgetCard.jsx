import { useCallback } from 'react';
import services from '../../../infrastructure/services.js';
import Card from '../../../design-system/components/Card/Card.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

function valueText(value) {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : typeof value === 'number' ? value.toFixed(2) : String(value);
}

export default function WidgetCard({ widget }) {
  const loader = useCallback(() => services.widgetExecution.execute(widget), [widget]);
  const { data: result, error, initialLoading, refreshing, refresh } = useWorkspaceQuery({
    workspaceId: widget.workspaceId, resource: 'widgetResult', params: { widgetId: widget.widgetId, updatedAt: widget.updatedAt }, loader, ttlMs: 15000,
  });
  if (initialLoading) return <Card className="p-4"><LoadingState message={`Loading ${widget.name}...`} className="min-h-28" /></Card>;
  if (error && !result) return <Card className="p-4"><ErrorState title={widget.name} message={error.message} retry={refresh} className="p-0" /></Card>;
  return <Card className="p-4"><div className="mb-3 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-neutral-500">{widget.type.replaceAll('_', ' ')}</p><h3 className="font-semibold">{widget.name}</h3></div>{refreshing && <span className="text-xs text-neutral-400">Refreshing…</span>}</div>
    {widget.type === 'KPI' && <p className="text-3xl font-semibold text-primary-700">{valueText(result?.value)}</p>}
    {widget.type === 'STATUS_SUMMARY' && (result?.groups.length ? <div className="space-y-2">{result.groups.map((group) => <div key={group.key} className="flex justify-between text-sm"><span>{group.key}</span><strong>{valueText(group.metrics.value ?? group.count)}</strong></div>)}</div> : <EmptyState title="No matching Records" />)}
    {['RECENT_RECORDS', 'TABLE', 'ASSIGNMENT'].includes(widget.type) && (result?.rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm"><tbody>{result.rows.map((row, index) => <tr key={row.recordId || index} className="border-t border-neutral-100">{Object.values(row.values).map((value, valueIndex) => <td key={valueIndex} className="whitespace-nowrap px-2 py-2">{typeof value === 'object' ? value?.displayName : value ?? '—'}</td>)}</tr>)}</tbody></table></div> : <EmptyState title="No matching data" />)}
  </Card>;
}
