import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';

function BellIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.08 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>;
}

export default function NotificationButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const userId = user?.userId || user?.uid;
    const load = () => {
      if (!currentWorkspace?.workspaceId || !userId) { setCount(0); return; }
      services.notification.countUnread(currentWorkspace.workspaceId, userId).then((value) => { if (!cancelled) setCount(value); }).catch(() => { if (!cancelled) setCount(0); });
    };
    load();
    window.addEventListener('notifications-changed', load);
    return () => { cancelled = true; window.removeEventListener('notifications-changed', load); };
  }, [currentWorkspace?.workspaceId, user]);
  return <button type="button" className="relative flex items-center gap-1 rounded-md p-2 text-sm text-neutral-600 hover:bg-neutral-100" onClick={() => navigate('/app/notifications')} aria-label={`${count} unread notifications`}><BellIcon /><span className="hidden xl:inline">Notifications</span>{count > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-primary-600 px-1.5 py-0.5 text-xs text-white">{count}</span>}</button>;
}
