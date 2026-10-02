/**
 * Header
 *
 * Authenticated application header. Contains workspace switcher,
 * placeholder areas for notifications/chat, and user menu.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider.jsx';
import { useWorkspace } from '../providers/WorkspaceProvider.jsx';
import IconButton from '../../design-system/components/IconButton/IconButton.jsx';
import Dropdown from '../../design-system/components/Dropdown/Dropdown.jsx';
import { DropdownItem } from '../../design-system/components/Dropdown/Dropdown.jsx';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import NotificationButton from '../../features/notifications/ui/NotificationButton.jsx';

function MenuIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function Header({ onOpenMobileMenu }) {
  const { user, signOut } = useAuth();
  const { currentWorkspace, worksets, activeWorkset, activateWorkset } = useWorkspace();

  const displayName = user?.displayName || user?.email || 'User';

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <div className="lg:hidden">
          <IconButton
            icon={MenuIcon}
            label="Open navigation menu"
            variant="ghost"
            size="md"
            onClick={onOpenMobileMenu}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded bg-primary-600" aria-hidden="true" />
          <span className="hidden text-lg font-semibold text-neutral-900 sm:inline">Modulity</span>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <WorkspaceSwitcher />
        <select id="active-workset" name="activeWorksetId" className="hidden max-w-36 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 md:block" aria-label="Active Workset" value={activeWorkset?.worksetId || ''} onChange={(event) => activateWorkset(event.target.value || null)}><option value="">All Modules</option>{worksets.map((workset) => <option key={workset.worksetId} value={workset.worksetId}>{workset.name}</option>)}</select>
        <div className="hidden h-4 w-px bg-neutral-200 lg:block" />
        <NotificationButton />
        <div className="hidden h-4 w-px bg-neutral-200 lg:block" />
        <Link to="/app/chat" className="flex items-center gap-1 rounded-md p-2 text-sm text-neutral-600 hover:bg-neutral-100" aria-label="Open Chat"><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.142-4.03 7.5-9 7.5a10.65 10.65 0 0 1-4.25-.87L3 19.5l1.13-3.39A6.7 6.7 0 0 1 3 12c0-4.142 4.03-7.5 9-7.5s9 3.358 9 7.5Z" /></svg><span className="hidden xl:inline">Chat</span></Link>

        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              className="ml-2 flex max-w-[10rem] items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <span className="hidden truncate lg:inline">{displayName}</span>
              <span className="h-6 w-6 rounded-full bg-primary-100 text-xs font-semibold leading-6 text-primary-700" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </button>
          }
        >
          <DropdownItem onClick={() => window.location.hash = '#profile'} disabled>
            Profile (coming soon)
          </DropdownItem>
          <DropdownItem onClick={() => { window.location.href = '/app/settings'; }}>
            {currentWorkspace?.organizationId ? 'Organization Settings' : 'Workspace Settings'}
          </DropdownItem>
          <DropdownItem onClick={() => signOut()}>Sign out</DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}

export default Header;
