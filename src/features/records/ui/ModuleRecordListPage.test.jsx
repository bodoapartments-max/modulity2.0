import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import ModuleRecordListPage from './ModuleRecordListPage.jsx';

const mocks = vi.hoisted(() => ({ getModule: vi.fn(), queryRecords: vi.fn(), getEntitiesByIds: vi.fn(), toggleStar: vi.fn() }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { module: { getModule: mocks.getModule }, recordQuery: { queryRecords: mocks.queryRecords }, entity: { getEntitiesByIds: mocks.getEntitiesByIds }, folder: { toggleStar: mocks.toggleStar } } }));

const mod = { moduleId: 'reservation', name: 'Reservation', status: 'ACTIVE', displayConfig: { listFields: ['guestName', 'room', 'arrivalDate'] }, formSchema: { fields: [{ key: 'room', label: 'Room', type: 'entity-reference' }, { key: 'guestName', label: 'Guest', type: 'text' }, { key: 'arrivalDate', label: 'Arrival', type: 'date' }] } };
const record = (id, guest) => ({ recordId: id, recordType: 'RESERVATION', status: 'SUBMITTED', createdAt: '2026-10-02T12:00:00.000Z', data: { guestName: guest, room: { entityId: 'room-1', entityTypeId: 'room-type', workspaceId: 'workspace-1' }, arrivalDate: '2026-10-10' }, entityReferences: [{ entityId: 'room-1', entityTypeId: 'room-type', workspaceId: 'workspace-1' }] });
function renderPage() { return render(<MemoryRouter initialEntries={['/app/modules/reservation/records']}><AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}><Routes><Route path="/app/modules/:moduleId/records" element={<ModuleRecordListPage />} /><Route path="/app/records/record-a" element={<div>Record A Detail</div>} /><Route path="/app/records/record-b" element={<div>Record B Detail</div>} /></Routes></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>); }

beforeEach(() => {
  mocks.getModule.mockResolvedValue(mod);
  mocks.getEntitiesByIds.mockResolvedValue([{ entityId: 'room-1', displayName: '101' }]);
});

describe('generic Module Record List', () => {
  it('settles a Module with zero Records', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    renderPage();
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
  });

  it('renders one canonical Record with declarative fields and Entity label', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('record-a', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    expect(await screen.findByText('Guest A')).toHaveAttribute('href', '/app/records/record-a?fromModule=reservation');
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders multiple independent Records linking to their canonical details', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('record-a', 'Guest A'), record('record-b', 'Guest B')], hasMore: false, nextCursor: null });
    renderPage();
    expect(await screen.findByText('Guest A')).toHaveAttribute('href', '/app/records/record-a?fromModule=reservation');
    expect(screen.getByText('Guest B')).toHaveAttribute('href', '/app/records/record-b?fromModule=reservation');
    expect(screen.getAllByText('101')).toHaveLength(2);
    fireEvent.click(screen.getByRole('link', { name: 'Open RESERVATION record-b' }));
    expect(await screen.findByText('Record B Detail')).toBeInTheDocument();
  });

  it('supports keyboard row navigation by canonical Record ID', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('record-a', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    const row = await screen.findByRole('link', { name: 'Open RESERVATION record-a' });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByText('Record A Detail')).toBeInTheDocument();
  });

  it('keeps checkbox and star interactions from navigating', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('record-a', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    await screen.findByText('Guest A');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('Reservation Records')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Star'));
    expect(mocks.toggleStar).toHaveBeenCalledWith('workspace-1', 'user-1', 'record-a');
    expect(screen.getByText('Reservation Records')).toBeInTheDocument();
  });
});
