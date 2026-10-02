/**
 * WorkspaceSwitcher
 *
 * Dropdown for switching between Personal and Organization workspaces.
 * Responsive: shows abbreviated label on small screens.
 */

import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../providers/WorkspaceProvider.jsx';
import { WORKSPACE_TYPES } from '../../core/workspace/workspace.js';
import Dropdown from '../../design-system/components/Dropdown/Dropdown.jsx';
import { DropdownItem } from '../../design-system/components/Dropdown/Dropdown.jsx';

function ChevronDownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function WorkspaceIcon({ type }) {
  if (type === WORKSPACE_TYPES.PERSONAL) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded bg-primary-100 text-xs font-bold text-primary-700" aria-hidden="true">
        P
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded bg-green-100 text-xs font-bold text-green-700" aria-hidden="true">
      O
    </span>
  );
}

function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const {
    currentWorkspace,
    availableWorkspaces,
    switchWorkspace,
    loading,
    switching,
    error,
  } = useWorkspace();

  if (loading) {
    return <span className="text-sm text-neutral-400">Loading workspace...</span>;
  }

  if (error || !currentWorkspace) {
    return <span className="text-sm text-red-600">Workspace unavailable</span>;
  }

  const workspaceName = currentWorkspace.type === WORKSPACE_TYPES.PERSONAL
    ? 'Personal'
    : currentWorkspace.name;

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
          aria-label={`Current workspace: ${workspaceName}`}
          disabled={switching}
        >
          <WorkspaceIcon type={currentWorkspace.type} />
          <span className="hidden max-w-[8rem] truncate sm:inline">{workspaceName}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 text-neutral-400" />
        </button>
      }
    >
      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Workspaces
      </div>

      {availableWorkspaces.map((ws) => {
        const isActive = ws.workspaceId === currentWorkspace.workspaceId;
        const label = ws.type === WORKSPACE_TYPES.PERSONAL ? 'Personal' : ws.name;

        return (
          <DropdownItem
            key={ws.workspaceId}
            onClick={async () => {
              if (await switchWorkspace(ws.workspaceId)) navigate('/app');
            }}
            className={isActive ? 'bg-primary-50 font-semibold text-primary-700' : ''}
          >
            <span className="flex items-center gap-2">
              <WorkspaceIcon type={ws.type} />
              <span className="truncate">{label}</span>
              {isActive && <span className="ml-auto text-primary-600" aria-label="Current">&#10003;</span>}
            </span>
          </DropdownItem>
        );
      })}

      <div className="my-1 border-t border-neutral-200" />

      <DropdownItem onClick={() => navigate('/app/create-organization')}>
        <span className="flex items-center gap-2 text-primary-600">
          <span className="text-lg leading-none">+</span>
          Create Organization
        </span>
      </DropdownItem>
    </Dropdown>
  );
}

export default WorkspaceSwitcher;
