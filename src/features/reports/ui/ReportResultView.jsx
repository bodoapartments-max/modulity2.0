import Card from '../../../design-system/components/Card/Card.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';

function displayValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value.displayName) return value.displayName;
  return String(value);
}

export default function ReportResultView({ result }) {
  const metricEntries = Object.entries(result.summary || {});
  const maxGroup = Math.max(1, ...result.groups.map((group) => Number(Object.values(group.metrics)[0] ?? group.count)));
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card className="p-4"><p className="text-xs font-semibold uppercase text-neutral-500">Records</p><p className="mt-1 text-2xl font-semibold">{result.totalMatched}</p></Card>{metricEntries.map(([key, value]) => <Card key={key} className="p-4"><p className="text-xs font-semibold uppercase text-neutral-500">{key.replaceAll('_', ' ')}</p><p className="mt-1 text-2xl font-semibold">{value == null ? '—' : Number.isInteger(value) ? value : Number(value).toFixed(2)}</p></Card>)}</div>
    {result.groups.length > 0 && <Card className="p-4"><h2 className="mb-4 font-semibold">Groups</h2><div className="space-y-3">{result.groups.map((group) => { const value = Number(Object.values(group.metrics)[0] ?? group.count); return <div key={group.key}><div className="mb-1 flex justify-between text-sm"><span>{group.key}</span><span>{value}</span></div><div className="h-3 rounded bg-neutral-100"><div className="h-3 rounded bg-primary-500" style={{ width: `${Math.max(2, value / maxGroup * 100)}%` }} /></div></div>; })}</div></Card>}
    {result.rows.length === 0 ? <EmptyState title="No report results" description="No canonical data matched this definition." /> : <div className="overflow-x-auto rounded-lg border border-neutral-200"><table className="min-w-full text-left text-sm"><thead className="bg-neutral-50"><tr>{result.definition.columns.map((column) => <th key={`${column.scope}:${column.field}`} className="whitespace-nowrap px-3 py-2 font-medium text-neutral-600">{column.label}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={row.recordId || index} className="border-t border-neutral-100">{result.definition.columns.map((column) => <td key={`${column.scope}:${column.field}`} className="whitespace-nowrap px-3 py-2">{displayValue(row.values[column.field])}</td>)}</tr>)}</tbody></table></div>}
    {result.truncated && <p className="text-sm text-amber-700">Showing the first {result.rows.length} of {result.totalMatched} matching rows. Narrow filters for a complete table.</p>}
  </div>;
}
