/**
 * Sidebar
 *
 * Primary navigation sidebar. Shows workspace-aware navigation items.
 * Organization-specific items (People, Groups, Settings) only appear
 * when the current workspace is an Organization workspace.
 */

import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../providers/WorkspaceProvider.jsx';

const mainLinks = [
  { label: 'Dashboard', to: '/app', exact: true },
  { label: 'Entity Types', to: '/app/entity-types' },
  { label: 'Entities', to: '/app/entities' },
  { label: 'My Modules', to: '/app/modules' },
  { label: 'Records', to: '/app/records' },
  { label: 'Ledger', to: '/app/ledger' },
  { label: 'Widgets', to: '/app/widgets', disabled: true },
  { label: 'Reports', to: '/app/reports', disabled: true },
];

const orgLinks = [
  { label: 'People', to: '/app/people' },
  { label: 'Groups', to: '/app/groups' },
  { label: 'Settings', to: '/app/settings' },
];

function SidebarLink({ link, onNavigate }) {
  if (link.disabled) {
    return (
      <li>
        <span
          className="block rounded-md px-3 py-2 text-sm font-medium text-neutral-400"
          aria-disabled="true"
          title="Coming soon"
        >
          {link.label}
        </span>
      </li>
    );
  }

  return (
    <li>
      <NavLink
        to={link.to}
        end={link.exact}
        onClick={onNavigate}
        className={({ isActive }) =>
          `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary-50 text-primary-700'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`
        }
      >
        {link.label}
      </NavLink>
    </li>
  );
}

function Sidebar({ onNavigate }) {
  const { isOrganizationWorkspace } = useWorkspace();

  return (
    <nav className="flex h-full flex-col border-r border-neutral-200 bg-white px-3 py-4 lg:border-none">
      <div className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Menu
      </div>
      <ul className="space-y-1">
        {mainLinks.map((link) => (
          <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />
        ))}
      </ul>

      {isOrganizationWorkspace && (
        <>
          <div className="mb-4 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Workspace
          </div>
          <ul className="space-y-1">
            {orgLinks.map((link) => (
              <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

export default Sidebar;
