import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EntityListPage from './EntityListPage.jsx';

const mocks = vi.hoisted(() => ({ getEntityType: vi.fn(), listEntitiesPage: vi.fn(), getEntitiesByIds: vi.fn() }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { entityType: { getEntityType: mocks.getEntityType }, entity: { listEntitiesPage: mocks.listEntitiesPage, getEntitiesByIds: mocks.getEntitiesByIds } } }));
const type = { typeId: 'room-type', code: 'ROOM', name: 'Room', category: 'DOMAIN', fields: [{ key: 'roomNumber', label: 'Room Number', type: 'text' }, { key: 'manager', label: 'Manager', type: 'entity-reference' }] };
function renderPage() { return render(<MemoryRouter initialEntries={['/app/entity-types/room-type/entities']}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}><Routes><Route path="/app/entity-types/:entityTypeId/entities" element={<EntityListPage />} /></Routes></WorkspaceContext.Provider></MemoryRouter>); }

beforeEach(() => { mocks.getEntityType.mockResolvedValue(type); mocks.getEntitiesByIds.mockResolvedValue([{ entityId: 'employee-1', displayName: 'Anna Smith' }]); });

describe('generic Entity List', () => {
  it('renders multiple schema-driven Entities and human EntityReference labels', async () => {
    mocks.listEntitiesPage.mockResolvedValue({ items: [{ entityId: 'room-101', displayName: 'Room 101', status: 'ACTIVE', data: { roomNumber: '101', manager: { entityId: 'employee-1' } } }, { entityId: 'room-102', displayName: 'Room 102', status: 'ACTIVE', data: { roomNumber: '102', manager: { entityId: 'employee-1' } } }], nextCursor: null, hasMore: false });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Room 101' })).toHaveAttribute('href', '/app/entities/room-101?fromType=room-type');
    expect(screen.getByRole('link', { name: 'Room 102' })).toBeInTheDocument();
    expect(screen.getAllByText('Anna Smith')).toHaveLength(2);
    expect(screen.getByText('Room Number')).toBeInTheDocument();
  });

  it('settles an empty Entity Type with a generic Add action', async () => {
    mocks.listEntitiesPage.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    renderPage();
    expect(await screen.findByText('No rooms yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add Room' })[0]).toHaveAttribute('href', '/app/entity-types/room-type/entities/new');
  });
});
