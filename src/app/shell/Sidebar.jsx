/**
 * Sidebar
 *
 * Primary navigation sidebar. Future navigation items are shown as placeholders
 * because their features are not implemented in Step 1.
 */

import { NavLink } from 'react-router-dom';

const futureLinks = [
  { label: 'Dashboard', to: '/app', exact: true },
  { label: 'My Modules', to: '/app/modules', disabled: true },
  { label: 'List', to: '/app/list', disabled: true },
  { label: 'Ledger', to: '/app/ledger', disabled: true },
  { label: 'Widgets', to: '/app/widgets', disabled: true },
  { label: 'Reports', to: '/app/reports', disabled: true },
];

function Sidebar({ onNavigate }) {
  return (
    <nav className="flex h-full flex-col border-r border-neutral-200 bg-white px-3 py-4 lg:border-none">
      <div className="mb-4 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Menu
      </div>
      <ul className="space-y-1">
        {futureLinks.map((link) => {
          if (link.disabled) {
            return (
              <li key={link.to}>
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
            <li key={link.to}>
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
        })}
      </ul>

      <div className="mt-auto px-3 py-4">
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">
            Workspace and organization features are coming in a later step.
          </p>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
