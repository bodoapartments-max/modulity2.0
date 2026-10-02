import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import WorksetsPage from '../../worksets/ui/WorksetsPage.jsx';
import WidgetsPage from '../../widgets/ui/WidgetsPage.jsx';
import NotificationsPage from '../../notifications/ui/NotificationsPage.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

const mocks = vi.hoisted(() => ({
  listWorksets: vi.fn(), listWidgets: vi.fn(), listNotifications: vi.fn(),
}));

vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    workset: { list: mocks.listWorksets },
    widget: { listForUser: mocks.listWidgets },
    notification: { listForUser: mocks.listNotifications },
  },
}));

const workspaceValue = {
  currentWorkspace: { workspaceId: 'ws-1', name: 'Personal', type: 'PERSONAL' },
  activeWorkset: null,
  activateWorkset: vi.fn(),
};
const authValue = { user: { userId: 'user-1' } };

function renderPage(page) {
  return render(<MemoryRouter><AuthContext.Provider value={authValue}><WorkspaceContext.Provider value={workspaceValue}>{page}</WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>);
}

describe('Workspace Experience empty states', () => {
  beforeEach(() => {
    workspaceQueryCache.clear();
    mocks.listWorksets.mockReset().mockResolvedValue([]);
    mocks.listWidgets.mockReset().mockResolvedValue([]);
    mocks.listNotifications.mockReset().mockResolvedValue([]);
  });

  it('settles Worksets loading into empty', async () => {
    renderPage(<WorksetsPage />);
    expect(await screen.findByText('No worksets yet')).toBeInTheDocument();
  });

  it('settles Widgets loading into empty', async () => {
    renderPage(<WidgetsPage />);
    expect(await screen.findByText('No widgets yet')).toBeInTheDocument();
  });

  it('settles Notifications loading into empty', async () => {
    renderPage(<NotificationsPage />);
    expect(await screen.findByText('No notifications')).toBeInTheDocument();
  });

  it('settles a query failure into ErrorState', async () => {
    mocks.listWorksets.mockRejectedValue(new Error('permission denied'));
    renderPage(<WorksetsPage />);
    expect(await screen.findByText('Worksets could not be loaded.')).toBeInTheDocument();
  });
});
