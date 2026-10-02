import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';

export default function WidgetsPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.userId || user?.uid;
  const [widgets, setWidgets] = useState([]);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    if (!currentWorkspace?.workspaceId || !userId) { setLoading(false); return; }
    try { setLoading(true); setError(null); setWidgets(await services.widget.listForUser(currentWorkspace.workspaceId, userId)); }
    catch { setError('Widgets could not be loaded.'); }
    finally { setLoading(false); }
  }, [currentWorkspace?.workspaceId, userId]);
  useEffect(() => { load(); }, [load]);
  async function create(event) {
    event.preventDefault();
    try { await services.widget.create({ workspaceId: currentWorkspace.workspaceId, ownerUserId: userId, name, type: 'KPI', source: 'RECORDS', metric: 'COUNT', filters: [], display: { title: name, limit: 10 }, createdBy: { actorType: 'USER', actorId: userId } }); setName(''); setShowForm(false); load(); }
    catch { setError('Widget could not be created.'); }
  }
  if (loading) return <PageContainer><LoadingState message="Loading widgets..." /></PageContainer>;
  return <PageContainer><PageHeader title="My Widgets" description="Configuration-driven views of canonical workspace data." action={<Button onClick={() => setShowForm(true)}>Create Widget</Button>} />
    {error && <ErrorState message={error} retry={load} />}
    {showForm && <Card className="mb-5 max-w-xl p-5"><form className="flex gap-3" onSubmit={create}><Input aria-label="Widget name" placeholder="Widget name" value={name} onChange={(event) => setName(event.target.value)} required /><Button type="submit">Create KPI</Button></form></Card>}
    {!error && widgets.length === 0 ? <EmptyState title="No widgets yet" description="Create a widget to monitor workspace activity." /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{widgets.map((widget) => <Card key={widget.widgetId} className="p-5"><p className="text-xs font-semibold uppercase text-neutral-500">{widget.type}</p><h2 className="mt-1 font-semibold">{widget.name}</h2><p className="mt-2 text-sm text-neutral-600">Source: {widget.source}</p><Button className="mt-4" size="sm" variant="ghost" onClick={async () => { await services.widget.archive(currentWorkspace.workspaceId, widget.widgetId, userId); load(); }}>Archive</Button></Card>)}</div>}
  </PageContainer>;
}
