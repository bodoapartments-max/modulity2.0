import { useCallback } from 'react';
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
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

export default function NotificationsPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;
  const loader = useCallback(() => services.notification.listForUser(workspaceId, userId, 50), [workspaceId, userId]);
  const { data: items = [], error, initialLoading, refresh } = useWorkspaceQuery({
    workspaceId, resource: 'notifications', params: { userId, page: 'first', limit: 50 }, loader, enabled: Boolean(workspaceId && userId), ttlMs: 10000,
  });

  if (workspaceLoading || initialLoading) return <PageContainer><LoadingState message="Loading notifications..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available workspace before viewing Notifications." /></PageContainer>;
  return <PageContainer><PageHeader title="Notifications" description="Actionable updates for this workspace." />{error && items.length === 0 ? <ErrorState message="Notifications could not be loaded." retry={refresh} /> : items.length === 0 ? <EmptyState title="No notifications" description="You are all caught up." /> : <div className="space-y-3">{items.map((item) => <Card key={item.notificationId} className={`p-4 ${item.status === 'UNREAD' ? 'border-primary-300' : ''}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{item.title}</h2><p className="mt-1 text-sm text-neutral-600">{item.message}</p>{item.actionUrl && <Link className="mt-2 inline-block text-sm text-primary-700" to={item.actionUrl}>Open</Link>}</div>{item.status === 'UNREAD' && <Button size="sm" variant="ghost" onClick={async () => { await services.notification.markRead(workspaceId, item.notificationId); window.dispatchEvent(new Event('notifications-changed')); refresh(); }}>Mark read</Button>}</div></Card>)}</div>}</PageContainer>;
}
