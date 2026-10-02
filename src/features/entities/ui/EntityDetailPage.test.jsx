import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EntityDetailPage from './EntityDetailPage.jsx';

const mocks = vi.hoisted(() => ({ getEntity: vi.fn(), getEntityType: vi.fn(), listRelationshipsForObject: vi.fn(), listRecordsByEntity: vi.fn(), getEntitiesByIds: vi.fn() }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { entity: { getEntity: mocks.getEntity, getEntitiesByIds: mocks.getEntitiesByIds }, entityType: { getEntityType: mocks.getEntityType }, relationship: { listRelationshipsForObject: mocks.listRelationshipsForObject }, record: { listRecordsByEntity: mocks.listRecordsByEntity } } }));

describe('generic Entity Detail', () => {
  it('renders canonical schema values, reference labels, edit, and context back navigation', async () => {
    mocks.getEntity.mockResolvedValue({ entityId: 'room-101', entityTypeId: 'room-type', displayName: 'Room 101', status: 'ACTIVE', schemaVersion: '1.0.0', data: { roomNumber: '101', manager: { entityId: 'employee-1' } }, createdAt: '2026-10-02T12:00:00.000Z' });
    mocks.getEntityType.mockResolvedValue({ typeId: 'room-type', code: 'ROOM', name: 'Room', fields: [{ key: 'roomNumber', label: 'Room Number', type: 'text' }, { key: 'manager', label: 'Manager', type: 'entity-reference' }] });
    mocks.getEntitiesByIds.mockResolvedValue([{ entityId: 'employee-1', displayName: 'Anna Smith' }]);
    mocks.listRelationshipsForObject.mockResolvedValue([]);
    mocks.listRecordsByEntity.mockResolvedValue([{ recordId: 'record-1' }]);
    render(<MemoryRouter initialEntries={['/app/entities/room-101?fromType=room-type']}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}><Routes><Route path="/app/entities/:entityId" element={<EntityDetailPage />} /></Routes></WorkspaceContext.Provider></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Room 101' })).toBeInTheDocument();
    expect(screen.getByText('Anna Smith')).toBeInTheDocument();
    expect(screen.getByText('Room Number').compareDocumentPosition(screen.getByText('Manager')) & 4).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/app/entities/room-101/edit');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByText(/1 record/)).toBeInTheDocument();
  });
});
