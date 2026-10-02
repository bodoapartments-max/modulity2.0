import { NavLink } from 'react-router-dom';
import { useWorkspace } from '../providers/WorkspaceProvider.jsx';

const sections = [
  { label: 'Workspace', links: [{ label: 'Dashboard', to: '/app', exact: true }] },
  { label: 'Work', links: [{ label: 'My Modules', to: '/app/modules' }, { label: 'Records', to: '/app/records' }, { label: 'Worksets', to: '/app/worksets' }] },
  { label: 'Data', links: [{ label: 'Entities', to: '/app/entities' }, { label: 'Entity Types', to: '/app/entity-types' }] },
  { label: 'Insights', links: [{ label: 'Widgets', to: '/app/widgets' }, { label: 'Reports', to: '/app/reports', disabled: true }] },
  { label: 'Governance', links: [{ label: 'Ledger', to: '/app/ledger' }] },
];

function SidebarLink({ link, onNavigate }) {
  if (link.disabled) return <li><span className="block rounded-md px-3 py-2 text-sm font-medium text-neutral-400" aria-disabled="true" title="Coming soon">{link.label}</span></li>;
  return <li><NavLink to={link.to} end={link.exact} onClick={onNavigate} className={({ isActive }) => `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-neutral-700 hover:bg-neutral-100'}`}>{link.label}</NavLink></li>;
}

export default function Sidebar({ onNavigate }) {
  const { isOrganizationWorkspace, activeWorkset } = useWorkspace();
  return <nav className="flex h-full flex-col overflow-y-auto border-r border-neutral-200 bg-white px-3 py-4 lg:border-none">
    {activeWorkset && <div className="mb-3 rounded-md bg-primary-50 px-3 py-2"><p className="text-xs font-semibold uppercase text-primary-600">Active Workset</p><p className="truncate text-sm font-medium text-primary-800">{activeWorkset.name}</p></div>}
    {sections.map((section) => <div key={section.label} className="mb-4"><div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">{section.label}</div><ul className="space-y-1">{section.links.map((link) => <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />)}</ul></div>)}
    {isOrganizationWorkspace && <div><div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Organization</div><ul className="space-y-1">{[{ label: 'People', to: '/app/people' }, { label: 'Groups', to: '/app/groups' }, { label: 'Settings', to: '/app/settings' }].map((link) => <SidebarLink key={link.to} link={link} onNavigate={onNavigate} />)}</ul></div>}
  </nav>;
}
