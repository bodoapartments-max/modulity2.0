/**
 * Notifications — in-app Notification Center.
 *
 * Bounded, cursor-paginated listing of the CURRENT user's canonical
 * Notifications within the CURRENT workspace. Read-state changes are
 * recipient-owned client mutations (status/readAt only — Firestore Rules
 * freeze every other field). The Notification document itself is authored
 * exclusively by trusted server boundaries.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';

const PAGE_SIZE = 25;

export default function NotificationsPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;

  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadFirst = useCallback(async () => {
    if (!workspaceId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const page = await services.notification.listForUserPage(workspaceId, userId, { pageSize: PAGE_SIZE });
      setItems(page.items);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err.message || 'Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => { void loadFirst(); }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!workspaceId || !userId || !cursor) return;
    try {
      const page = await services.notification.listForUserPage(workspaceId, userId, { pageSize: PAGE_SIZE, afterSnapshot: cursor });
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err.message);
    }
  }, [workspaceId, userId, cursor]);

  const markRead = useCallback(async (item) => {
    setActionError(null);
    try {
      await services.notification.markRead(workspaceId, item.notificationId);
      setItems((prev) => prev.map((entry) => (entry.notificationId === item.notificationId ? { ...entry, status: 'READ' } : entry)));
      window.dispatchEvent(new Event('notifications-changed'));
    } catch (err) {
      setActionError(err.message);
    }
  }, [workspaceId]);

  const markAllRead = useCallback(async () => {
    setActionError(null);
    try {
      const unread = items.filter((entry) => entry.status === 'UNREAD');
      for (const entry of unread) {
        await services.notification.markRead(workspaceId, entry.notificationId);
      }
      window.dispatchEvent(new Event('notifications-changed'));
      setItems((prev) => prev.map((entry) => (entry.status === 'UNREAD' ? { ...entry, status: 'READ' } : entry)));
    } catch (err) {
      setActionError(err.message);
    } finally {
      void loadFirst();
    }
  }, [workspaceId, items, loadFirst]);

  if (workspaceLoading || loading) return <PageContainer><LoadingState message="Loading notifications..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available workspace before viewing Notifications." /></PageContainer>;

  const unreadCount = items.filter((entry) => entry.status === 'UNREAD').length;

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="Actionable updates for this workspace."
        action={unreadCount > 0 ? <Button type="button" variant="outline" size="sm" onClick={markAllRead}>Mark all read</Button> : null}
      />
      {actionError && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {error && items.length === 0 ? (
        <ErrorState message="Notifications could not be loaded." retry={loadFirst} />
      ) : items.length === 0 ? (
        <EmptyState title="No notifications" description="You are all caught up." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.notificationId} className={`p-4 ${item.status === 'UNREAD' ? 'border-primary-300 bg-primary-50/30' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-neutral-900">{item.title}</h2>
                    {item.status === 'UNREAD'
                      ? <Badge variant="primary">Unread</Badge>
                      : <Badge variant="default">Read</Badge>}
                    {item.priority === 'ATTENTION' && <Badge variant="warning">Attention</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{item.message}</p>
                  {item.actionUrl && (
                    <Link className="mt-2 inline-block text-sm font-medium text-primary-700 hover:underline" to={item.actionUrl}>
                      Open
                    </Link>
                  )}
                  <p className="mt-1 text-xs text-neutral-400">
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </p>
                </div>
                {item.status === 'UNREAD' && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(item)}>Mark read</Button>
                )}
              </div>
            </Card>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="outline" size="sm" onClick={loadMore}>
                Load older notifications
              </Button>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
