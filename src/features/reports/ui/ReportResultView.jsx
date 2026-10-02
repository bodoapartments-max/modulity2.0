import Card from '../../../design-system/components/Card/Card.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';

function displayValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value.displayName) return value.displayName;
  return String(value);
}

function GroupChart({ groups, type }) {
  const values = groups.map((group) => Number(Object.values(group.metrics)[0] ?? group.count));
  const max = Math.max(1, ...values);
  if (type === 'LINE') {
    const points = values.map((value, index) => `${groups.length === 1 ? 50 : index / (groups.length - 1) * 100},${95 - value / max * 85}`).join(' ');
    return <div><svg className="h-48 w-full" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Line chart"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-600" /></svg><div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-500">{groups.map((group) => <span key={group.key}>{group.key}</span>)}</div></div>;
  }
  if (type === 'DONUT') {
    const total = Math.max(1, values.reduce((sum, value) => sum + value, 0));
    let cursor = 0;
    const colors = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626'];
    const stops = values.map((value, index) => { const start = cursor; cursor += value / total * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; }).join(', ');
    return <div className="flex flex-col items-center gap-4 sm:flex-row"><div className="h-40 w-40 rounded-full" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label="Donut chart" /><div className="space-y-2">{groups.map((group, index) => <div key={group.key} className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded" style={{ backgroundColor: colors[index % colors.length] }} /><span>{group.key}: {values[index]}</span></div>)}</div></div>;
  }
  return <div className="space-y-3">{groups.map((group, index) => <div key={group.key}><div className="mb-1 flex justify-between text-sm"><span>{group.key}</span><span>{values[index]}</span></div><div className="h-3 rounded bg-neutral-100"><div className="h-3 rounded bg-primary-500" style={{ width: `${Math.max(2, values[index] / max * 100)}%` }} /></div></div>)}</div>;
}

export default function ReportResultView({ result }) {
  const metricEntries = Object.entries(result.summary || {});
  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card className="p-4"><p className="text-xs font-semibold uppercase text-neutral-500">Records</p><p className="mt-1 text-2xl font-semibold">{result.totalMatched}</p></Card>{metricEntries.map(([key, value]) => <Card key={key} className="p-4"><p className="text-xs font-semibold uppercase text-neutral-500">{key.replaceAll('_', ' ')}</p><p className="mt-1 text-2xl font-semibold">{value == null ? '—' : Number.isInteger(value) ? value : Number(value).toFixed(2)}</p></Card>)}</div>
    {result.groups.length > 0 && <Card className="p-4"><h2 className="mb-4 font-semibold">Groups</h2><GroupChart groups={result.groups} type={result.definition.visualization?.type || 'BAR'} /></Card>}
    {result.rows.length === 0 ? <EmptyState title="No report results" description="No canonical data matched this definition." /> : <div className="overflow-x-auto rounded-lg border border-neutral-200"><table className="min-w-full text-left text-sm"><thead className="bg-neutral-50"><tr>{result.definition.columns.map((column) => <th key={`${column.scope}:${column.field}`} className="whitespace-nowrap px-3 py-2 font-medium text-neutral-600">{column.label}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={row.recordId || index} className="border-t border-neutral-100">{result.definition.columns.map((column) => <td key={`${column.scope}:${column.field}`} className="whitespace-nowrap px-3 py-2">{displayValue(row.values[column.field])}</td>)}</tr>)}</tbody></table></div>}
    {result.truncated && <p className="text-sm text-amber-700">Showing the first {result.rows.length} of {result.totalMatched} matching rows. Narrow filters for a complete table.</p>}
  </div>;
}
