import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';

export default function NotificationsPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.userId || user?.uid;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    if (!currentWorkspace?.workspaceId || !userId) { setLoading(false); return; }
    try { setLoading(true); setError(null); setItems(await services.notification.listForUser(currentWorkspace.workspaceId, userId, 50)); }
    catch { setError('Notifications could not be loaded.'); }
    finally { setLoading(false); }
  }, [currentWorkspace?.workspaceId, userId]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <PageContainer><LoadingState message="Loading notifications..." /></PageContainer>;
  return <PageContainer><PageHeader title="Notifications" description="Actionable updates for this workspace." />{error ? <ErrorState message={error} retry={load} /> : items.length === 0 ? <EmptyState title="No notifications" description="You are all caught up." /> : <div className="space-y-3">{items.map((item) => <Card key={item.notificationId} className={`p-4 ${item.status === 'UNREAD' ? 'border-primary-300' : ''}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{item.title}</h2><p className="mt-1 text-sm text-neutral-600">{item.message}</p>{item.actionUrl && <Link className="mt-2 inline-block text-sm text-primary-700" to={item.actionUrl}>Open</Link>}</div>{item.status === 'UNREAD' && <Button size="sm" variant="ghost" onClick={async () => { await services.notification.markRead(currentWorkspace.workspaceId, item.notificationId); load(); }}>Mark read</Button>}</div></Card>)}</div>}</PageContainer>;
}
