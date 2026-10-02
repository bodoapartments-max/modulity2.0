import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EntityTypeDetailPage from './EntityTypeDetailPage.jsx';

vi.mock('../../../app/hooks/useWorkspaceQuery.js', () => ({ useWorkspaceQuery: () => ({ data: { entityType: { typeId: 'auto_et_room', code: 'ROOM', name: 'Room', category: 'DOMAIN', description: 'Hotel room identity', fields: [{ key: 'roomNumber', label: 'Room Number', type: 'text', required: true }] }, count: 2, usedBy: [{ moduleId: 'reservation', name: 'Reservation' }] }, error: null, initialLoading: false }) }));
vi.mock('../../../infrastructure/services.js', () => ({ default: {} }));

describe('EntityTypeDetailPage', () => {
  it('derives fields, count, actions, and Module usage from canonical metadata', () => {
    render(<MemoryRouter initialEntries={['/app/entity-types/auto_et_room']}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}><Routes><Route path="/app/entity-types/:entityTypeId" element={<EntityTypeDetailPage />} /></Routes></WorkspaceContext.Provider></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Room' })).toBeInTheDocument();
    expect(screen.getByText('Room Number')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Rooms' })).toHaveAttribute('href', '/app/entity-types/auto_et_room/entities');
    expect(screen.getByRole('link', { name: 'Add Room' })).toHaveAttribute('href', '/app/entity-types/auto_et_room/entities/new');
    expect(screen.getByRole('link', { name: 'Reservation' })).toHaveAttribute('href', '/app/modules/reservation/records');
  });
});
