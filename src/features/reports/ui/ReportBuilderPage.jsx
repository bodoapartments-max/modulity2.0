import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ReportResultView from './ReportResultView.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

const systemRefs = Object.entries(SYSTEM_FIELDS).map(([field, config]) => ({ scope: 'SYSTEM', field, type: config.type, label: config.label }));
const fieldType = (type) => type === 'number' || type === 'currency' ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime' : type === 'boolean' ? 'boolean' : type === 'entity-reference' ? 'entity-reference' : 'text';
const refKey = (ref) => `${ref.scope}:${ref.field}`;

export default function ReportBuilderPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const actor = { actorType: 'USER', actorId: user?.userId || user?.uid };
  const [modules, setModules] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [moduleIds, setModuleIds] = useState([]);
  const [columnKeys, setColumnKeys] = useState(['SYSTEM:createdAt', 'SYSTEM:status']);
  const [metricType, setMetricType] = useState('COUNT');
  const [metricFieldKey, setMetricFieldKey] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePeriod, setDatePeriod] = useState('THIS_MONTH');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visualization, setVisualization] = useState('TABLE');
  const [existing, setExisting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return undefined;
    Promise.all([services.module.listModules(workspaceId), reportId ? services.report.get(workspaceId, reportId) : null]).then(([nextModules, report]) => {
      if (cancelled) return;
      setModules(nextModules.filter((module) => module.status !== 'ARCHIVED'));
      if (report) {
        setExisting(report); setName(report.name); setDescription(report.description); setModuleIds(report.dataSources.map((source) => source.moduleId));
        setColumnKeys(report.columns.map(refKey)); setMetricType(report.metrics[0]?.type || 'COUNT'); setMetricFieldKey(report.metrics[0]?.fieldRef ? refKey(report.metrics[0].fieldRef) : '');
        setGroupKey(report.groupBy[0] ? refKey(report.groupBy[0]) : ''); setStatusFilter(report.filters.find((item) => item.fieldRef.field === 'status')?.value || '');
        setDatePeriod(report.datePeriod?.type || 'CUSTOM'); setDateFrom(report.datePeriod?.from?.slice(0, 10) || ''); setDateTo(report.datePeriod?.to?.slice(0, 10) || ''); setVisualization(report.visualization?.type || 'TABLE');
      }
    }).catch(() => setError('Report Builder data could not be loaded.')).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, reportId]);

  const fields = useMemo(() => {
    const map = new Map(systemRefs.map((ref) => [refKey(ref), ref]));
    for (const module of modules.filter((item) => moduleIds.includes(item.moduleId))) for (const field of module.formSchema?.fields || []) {
      const ref = { scope: 'DATA', field: field.key, type: fieldType(field.type), label: field.label || field.key };
      if (!map.has(refKey(ref))) map.set(refKey(ref), ref);
    }
    return [...map.values()];
  }, [modules, moduleIds]);
  const byKey = useMemo(() => Object.fromEntries(fields.map((field) => [refKey(field), field])), [fields]);

  function definition() {
    const columns = columnKeys.map((key) => byKey[key]).filter(Boolean);
    const metricField = byKey[metricFieldKey] || null;
    return {
      workspaceId, name, description, status: 'ACTIVE', version: existing?.version || 1,
      dataSources: moduleIds.map((moduleId) => ({ sourceType: 'RECORDS', moduleId })),
      filters: statusFilter ? [{ fieldRef: byKey['SYSTEM:status'], operator: 'EQUALS', value: statusFilter }] : [],
      datePeriod: datePeriod === 'CUSTOM'
        ? dateFrom && dateTo ? { type: 'CUSTOM', from: `${dateFrom}T00:00:00.000Z`, to: `${dateTo}T23:59:59.999Z` } : null
        : datePeriod ? { type: datePeriod } : null,
      groupBy: groupKey && byKey[groupKey] ? [byKey[groupKey]] : [],
      metrics: [{ type: metricType, fieldRef: metricType === 'COUNT' ? null : metricField, key: metricType === 'COUNT' ? 'record_count' : `${metricType.toLowerCase()}_${metricField?.field || 'value'}` }],
      columns, sort: [{ fieldRef: byKey['SYSTEM:createdAt'], direction: 'desc' }], visualization: { type: visualization }, createdBy: existing?.createdBy || actor,
    };
  }

  async function runPreview() {
    try { setError(null); setPreview(await services.report.preview({ ...definition(), reportId: existing?.reportId || 'preview' })); }
    catch (previewError) { setError(previewError.code === 'LIMIT_EXCEEDED' ? previewError.message : `Preview failed: ${previewError.message}`); }
  }
  async function save(event) {
    event.preventDefault();
    try {
      setError(null);
      const saved = existing
        ? await services.report.update(workspaceId, existing.reportId, definition(), actor)
        : await services.report.create(definition());
      workspaceQueryCache.invalidate(`${workspaceId}:reports:`);
      navigate(`/app/reports/${saved.reportId}`);
    } catch (saveError) { setError(`Report could not be saved: ${saveError.message}`); }
  }

  if (loading) return <PageContainer><LoadingState message="Loading Report Builder..." /></PageContainer>;
  return <PageContainer><PageHeader title={existing ? 'Edit Report' : 'Create Report'} description="Configure a bounded deterministic projection over canonical Records." />{error && <ErrorState message={error} />}
    <Card className="mb-6 p-5"><form className="space-y-5" onSubmit={save}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="report-name">Name</Label><Input id="report-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div><Label htmlFor="report-description">Description</Label><Input id="report-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div></div>
      <fieldset><legend className="mb-2 text-sm font-medium">Source Modules (maximum 5)</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{modules.map((module) => <label key={module.moduleId} className="flex items-center gap-2 rounded border border-neutral-200 p-3 text-sm"><input type="checkbox" checked={moduleIds.includes(module.moduleId)} disabled={!moduleIds.includes(module.moduleId) && moduleIds.length >= 5} onChange={(event) => setModuleIds((current) => event.target.checked ? [...current, module.moduleId] : current.filter((id) => id !== module.moduleId))} />{module.name}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">Columns</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{fields.map((field) => <label key={refKey(field)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={columnKeys.includes(refKey(field))} disabled={!columnKeys.includes(refKey(field)) && columnKeys.length >= 12} onChange={(event) => setColumnKeys((current) => event.target.checked ? [...current, refKey(field)] : current.filter((key) => key !== refKey(field)))} />{field.label}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="metric-type">Metric</Label><select id="metric-type" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={metricType} onChange={(event) => setMetricType(event.target.value)}>{['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVERAGE', 'MIN', 'MAX'].map((value) => <option key={value}>{value}</option>)}</select></div>{metricType !== 'COUNT' && <div><Label htmlFor="metric-field">Metric field</Label><select id="metric-field" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={metricFieldKey} onChange={(event) => setMetricFieldKey(event.target.value)}><option value="">Select field</option>{fields.filter((field) => metricType === 'COUNT_DISTINCT' || field.type === 'number').map((field) => <option key={refKey(field)} value={refKey(field)}>{field.label}</option>)}</select></div>}<div><Label htmlFor="group-field">Group by</Label><select id="group-field" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={groupKey} onChange={(event) => setGroupKey(event.target.value)}><option value="">No grouping</option>{fields.map((field) => <option key={refKey(field)} value={refKey(field)}>{field.label}</option>)}</select></div><div><Label htmlFor="date-period">Period (UTC)</Label><select id="date-period" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={datePeriod} onChange={(event) => setDatePeriod(event.target.value)}>{['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'].map((value) => <option key={value}>{value.replaceAll('_', ' ')}</option>)}</select></div><div><Label htmlFor="status-filter">Status</Label><Input id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="Optional exact status" /></div><div><Label htmlFor="visualization">Visualization</Label><select id="visualization" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={visualization} onChange={(event) => setVisualization(event.target.value)}>{['TABLE', 'BAR', 'LINE', 'DONUT'].map((value) => <option key={value}>{value}</option>)}</select></div></div>
      {datePeriod === 'CUSTOM' && <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="date-from">From (UTC)</Label><Input id="date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} required /></div><div><Label htmlFor="date-to">To (UTC)</Label><Input id="date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} required /></div></div>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={runPreview}>Run Preview</Button><Button type="submit">{existing ? 'Save Changes' : 'Create Report'}</Button></div></form></Card>{preview && <ReportResultView result={preview} />}
  </PageContainer>;
}
