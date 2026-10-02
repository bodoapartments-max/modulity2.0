import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';

export default function NotificationButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const userId = user?.userId || user?.uid;
    if (!currentWorkspace?.workspaceId || !userId) { setCount(0); return undefined; }
    services.notification.countUnread(currentWorkspace.workspaceId, userId).then((value) => { if (!cancelled) setCount(value); }).catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, [currentWorkspace?.workspaceId, user]);
  return <button type="button" className="relative rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100" onClick={() => navigate('/app/notifications')} aria-label={`${count} unread notifications`}>Notifications{count > 0 && <span className="ml-1 rounded-full bg-primary-600 px-1.5 py-0.5 text-xs text-white">{count}</span>}</button>;
}
