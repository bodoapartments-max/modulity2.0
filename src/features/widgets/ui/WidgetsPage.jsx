import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import { SYSTEM_FIELDS } from '../../../core/analytics/analyticsDefinition.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

const typeFor = (type) => type === 'number' || type === 'currency' ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime' : type === 'entity-reference' ? 'entity-reference' : type === 'boolean' ? 'boolean' : 'text';
const keyFor = (ref) => `${ref.scope}:${ref.field}`;

export default function WidgetsPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.userId || user?.uid;
  const workspaceId = currentWorkspace?.workspaceId;
  const [modules, setModules] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('KPI');
  const [moduleId, setModuleId] = useState('');
  const [metric, setMetric] = useState('COUNT');
  const [metricFieldKey, setMetricFieldKey] = useState('');
  const [groupKey, setGroupKey] = useState('SYSTEM:status');
  const [columnKeys, setColumnKeys] = useState(['SYSTEM:createdAt', 'SYSTEM:status']);
  const [statusFilter, setStatusFilter] = useState('');
  const [limit, setLimit] = useState(10);
  const [actionError, setActionError] = useState(null);
  const loader = useCallback(() => services.widget.listForUser(workspaceId, userId), [workspaceId, userId]);
  const { data: widgets = [], error, initialLoading: loading, refresh } = useWorkspaceQuery({ workspaceId, resource: 'widgets', params: { userId }, loader, enabled: Boolean(workspaceId && userId) });
  useEffect(() => { if (workspaceId) services.module.listModules(workspaceId).then((items) => setModules(items.filter((item) => item.status !== 'ARCHIVED'))).catch(() => setActionError('Modules could not be loaded.')); }, [workspaceId]);
  const selectedModule = modules.find((item) => item.moduleId === moduleId);
  const fields = useMemo(() => [
    ...Object.entries(SYSTEM_FIELDS).map(([field, config]) => ({ scope: 'SYSTEM', field, type: config.type, label: config.label })),
    ...(selectedModule?.formSchema?.fields || []).map((field) => ({ scope: 'DATA', field: field.key, type: typeFor(field.type), label: field.label || field.key })),
  ], [selectedModule]);
  const byKey = useMemo(() => Object.fromEntries(fields.map((field) => [keyFor(field), field])), [fields]);

  function reset(widget = null) {
    setEditing(widget); setName(widget?.name || ''); setType(widget?.type || 'KPI'); setModuleId(widget?.moduleId || '');
    setMetric(typeof widget?.metric === 'string' ? widget.metric : widget?.metric?.type || 'COUNT');
    setMetricFieldKey(widget?.metricField ? keyFor(widget.metricField) : ''); setGroupKey(widget?.groupBy ? keyFor(widget.groupBy) : 'SYSTEM:status');
    setColumnKeys((widget?.columns || []).map(keyFor).length ? widget.columns.map(keyFor) : ['SYSTEM:createdAt', 'SYSTEM:status']);
    setStatusFilter(widget?.filters?.find((item) => item.fieldRef?.field === 'status')?.value || ''); setLimit(widget?.display?.limit || 10); setShowForm(true);
  }
  async function save(event) {
    event.preventDefault();
    const definition = {
      name, type, source: type === 'ASSIGNMENT' ? 'RELATIONSHIPS' : 'RECORDS', moduleId: type === 'ASSIGNMENT' ? null : moduleId,
      filters: statusFilter ? [{ fieldRef: byKey['SYSTEM:status'], operator: 'EQUALS', value: statusFilter }] : [],
      metric, metricField: metric === 'COUNT' ? null : byKey[metricFieldKey] || null,
      groupBy: type === 'STATUS_SUMMARY' ? byKey[groupKey] || byKey['SYSTEM:status'] : null,
      columns: type === 'ASSIGNMENT'
        ? [{ scope: 'ENTITY', field: 'source.objectId', type: 'entity-reference', label: 'Source' }, { scope: 'ENTITY', field: 'target.objectId', type: 'entity-reference', label: 'Assigned To' }, { scope: 'ENTITY', field: 'relationshipType', type: 'text', label: 'Relationship' }]
        : ['TABLE', 'RECENT_RECORDS'].includes(type) ? columnKeys.map((key) => byKey[key]).filter(Boolean) : [],
      display: { title: name, limit: Number(limit) }, size: type === 'KPI' ? 'SMALL' : 'MEDIUM',
    };
    try {
      setActionError(null);
      if (editing) await services.widget.update(workspaceId, editing.widgetId, definition, userId);
      else await services.widget.create({ ...definition, workspaceId, ownerUserId: userId, createdBy: { actorType: 'USER', actorId: userId } });
      setShowForm(false); setEditing(null); await refresh();
    } catch (saveError) { setActionError(`Widget could not be saved: ${saveError.message}`); }
  }

  if (workspaceLoading || loading) return <PageContainer><LoadingState message="Loading Widgets..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available Workspace before managing Widgets." /></PageContainer>;
  return <PageContainer><PageHeader title="My Widgets" description="Executable definitions over canonical workspace data." action={<Button onClick={() => reset()}>Create Widget</Button>} />{(error || actionError) && <ErrorState message={actionError || 'Widgets could not be loaded.'} retry={refresh} />}
    {showForm && <Card className="mb-6 p-5"><form className="space-y-4" onSubmit={save}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="widget-name">Name</Label><Input id="widget-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div><Label htmlFor="widget-type">Type</Label><select id="widget-type" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}>{['KPI', 'STATUS_SUMMARY', 'RECENT_RECORDS', 'TABLE', 'ASSIGNMENT'].map((value) => <option key={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>{type !== 'ASSIGNMENT' && <div><Label htmlFor="widget-module">Module</Label><select id="widget-module" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={moduleId} onChange={(event) => setModuleId(event.target.value)} required><option value="">Select Module</option>{modules.map((module) => <option key={module.moduleId} value={module.moduleId}>{module.name}</option>)}</select></div>}<div><Label htmlFor="widget-limit">Limit</Label><Input id="widget-limit" type="number" min="1" max="100" value={limit} onChange={(event) => setLimit(event.target.value)} /></div></div>
      {!['RECENT_RECORDS', 'TABLE', 'ASSIGNMENT'].includes(type) && <div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="widget-metric">Metric</Label><select id="widget-metric" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={metric} onChange={(event) => setMetric(event.target.value)}>{['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVERAGE', 'MIN', 'MAX'].map((value) => <option key={value}>{value}</option>)}</select></div>{metric !== 'COUNT' && <div><Label htmlFor="widget-metric-field">Field</Label><select id="widget-metric-field" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={metricFieldKey} onChange={(event) => setMetricFieldKey(event.target.value)}><option value="">Select field</option>{fields.filter((field) => metric === 'COUNT_DISTINCT' || field.type === 'number').map((field) => <option key={keyFor(field)} value={keyFor(field)}>{field.label}</option>)}</select></div>}{type === 'STATUS_SUMMARY' && <div><Label htmlFor="widget-group">Group by</Label><select id="widget-group" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={groupKey} onChange={(event) => setGroupKey(event.target.value)}>{fields.map((field) => <option key={keyFor(field)} value={keyFor(field)}>{field.label}</option>)}</select></div>}</div>}
      {['TABLE', 'RECENT_RECORDS'].includes(type) && <fieldset><legend className="mb-2 text-sm font-medium">Fields</legend><div className="grid gap-2 sm:grid-cols-3">{fields.map((field) => <label key={keyFor(field)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={columnKeys.includes(keyFor(field))} onChange={(event) => setColumnKeys((current) => event.target.checked ? [...current, keyFor(field)] : current.filter((key) => key !== keyFor(field)))} />{field.label}</label>)}</div></fieldset>}
      {type !== 'ASSIGNMENT' && <div><Label htmlFor="widget-status">Status filter</Label><Input id="widget-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="Optional exact status" /></div>}<div className="flex gap-2"><Button type="submit">{editing ? 'Save Widget' : 'Create Widget'}</Button><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div></form></Card>}
    {!error && widgets.length === 0 ? <EmptyState title="No Widgets yet" description="Create a Widget to monitor canonical workspace activity." /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{widgets.map((widget) => <Card key={widget.widgetId} className="p-5"><p className="text-xs font-semibold uppercase text-neutral-500">{widget.type}</p><h2 className="mt-1 font-semibold">{widget.name}</h2><p className="mt-2 text-sm text-neutral-600">{widget.source}{widget.moduleId ? ` · ${modules.find((module) => module.moduleId === widget.moduleId)?.name || 'Unavailable Module'}` : ''}</p><div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => reset(widget)}>Edit</Button><Button size="sm" variant="ghost" onClick={async () => { await services.widget.archive(workspaceId, widget.widgetId, userId); refresh(); }}>Archive</Button></div></Card>)}</div>}
  </PageContainer>;
}
