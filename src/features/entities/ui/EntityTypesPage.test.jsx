import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EntityTypesPage from './EntityTypesPage.jsx';

vi.mock('../../../app/hooks/useWorkspaceQuery.js', () => ({ useWorkspaceQuery: () => ({ data: [{ typeId: 'core:employee', code: 'EMPLOYEE', name: 'Employee', category: 'CORE', description: 'Employee', fields: [] }, { typeId: 'auto_et_room', code: 'ROOM', name: 'Room', category: 'DOMAIN', description: 'Room', fields: [] }], error: null, initialLoading: false, refresh: vi.fn() }) }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { entityType: { seedCoreTypes: vi.fn(), listEntityTypes: vi.fn(), createDomainEntityType: vi.fn() } } }));

describe('Entity Type registry navigation', () => {
  it('links Core and Domain cards to the generic Entity Type Detail route', () => {
    render(<MemoryRouter><AuthContext.Provider value={{ user: { userId: 'owner' } }}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' }, loading: false, error: null }}><EntityTypesPage /></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Employee/ })).toHaveAttribute('href', '/app/entity-types/core%3Aemployee');
    expect(screen.getByRole('link', { name: /Room/ })).toHaveAttribute('href', '/app/entity-types/auto_et_room');
  });
});
