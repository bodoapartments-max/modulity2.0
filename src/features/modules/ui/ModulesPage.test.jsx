import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import ModulesPage from './ModulesPage.jsx';

vi.mock('../../../app/hooks/useWorkspaceQuery.js', () => ({ useWorkspaceQuery: () => ({ data: [{ moduleId: 'reservation', moduleCode: 'RESERVATION', name: 'Reservation', status: 'ACTIVE', version: 1, formSchema: { fields: [] } }], error: null, initialLoading: false, refreshing: false }) }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { module: { listModules: vi.fn() } } }));

describe('ModulesPage operational entry', () => {
  it('opens the generic Module Record List from a Module card', () => {
    render(<MemoryRouter><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' }, activeWorkset: null, activateWorkset: vi.fn(), loading: false, error: null }}><ModulesPage /></WorkspaceContext.Provider></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Reservation/ })).toHaveAttribute('href', '/app/modules/reservation/records');
  });
});
