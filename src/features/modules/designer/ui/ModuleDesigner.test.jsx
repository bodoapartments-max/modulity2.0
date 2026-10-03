import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../../app/providers/WorkspaceProvider.jsx';
import ModuleDesigner from './ModuleDesigner.jsx';

const mocks = vi.hoisted(() => ({ seedCoreTypes: vi.fn(), listEntityTypes: vi.fn(), getModule: vi.fn(), createModule: vi.fn(), updateModule: vi.fn(), activateModule: vi.fn(), listEntities: vi.fn() }));
vi.mock('../../../../infrastructure/services.js', () => ({ default: { entityType: { seedCoreTypes: mocks.seedCoreTypes, listEntityTypes: mocks.listEntityTypes }, entity: { listEntities: mocks.listEntities }, module: { getModule: mocks.getModule, createModule: mocks.createModule, updateModule: mocks.updateModule, activateModule: mocks.activateModule } } }));
const workspace = { workspaceId: 'workspace-1', name: 'Workspace' };
const types = [{ typeId: 'core:employee', code: 'EMPLOYEE', name: 'Employee', category: 'CORE' }, { typeId: 'core:vehicle', code: 'VEHICLE', name: 'Vehicle', category: 'CORE' }, { typeId: 'room-type', code: 'ROOM', name: 'Room', category: 'DOMAIN' }];
function renderDesigner(moduleId = null) { return render(<MemoryRouter initialEntries={[moduleId ? `/app/modules/${moduleId}/edit` : '/app/modules/new']}><AuthContext.Provider value={{ user: { userId: 'owner' } }}><WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><Routes><Route path="/app/modules/new" element={<ModuleDesigner />} /><Route path="/app/modules/:moduleId/edit" element={<ModuleDesigner moduleId={moduleId} />} /><Route path="/app/modules/:moduleId" element={<div>Module Detail</div>} /></Routes></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.seedCoreTypes.mockResolvedValue([]);
  mocks.listEntityTypes.mockResolvedValue(types);
  mocks.listEntities.mockResolvedValue([]);
});

describe('generic Module Designer', () => {
  it('creates and publishes a generic Module through canonical services', async () => {
    mocks.createModule.mockImplementation(async (payload) => ({ ...payload, moduleId: 'vehicle-inspection', status: 'DRAFT', version: 1, recordConfig: { recordType: payload.moduleCode } }));
    mocks.activateModule.mockResolvedValue({ moduleId: 'vehicle-inspection', moduleCode: 'VEHICLE_INSPECTION', name: 'Vehicle Inspection', status: 'ACTIVE', version: 1, formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'notes', label: 'Notes', type: 'text', required: false }] }, displayConfig: { listFields: ['notes'] } });
    renderDesigner();
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Vehicle Inspection' } });
    fireEvent.change(screen.getByLabelText(/Code/), { target: { value: 'VEHICLE_INSPECTION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Notes' } });
    fireEvent.click(screen.getByLabelText('Show in Record List'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish Module' }));
    await waitFor(() => expect(mocks.createModule).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', moduleCode: 'VEHICLE_INSPECTION', formSchema: { schemaVersion: '1.0.0', fields: [expect.objectContaining({ key: 'notes', label: 'Notes', type: 'text' })] }, displayConfig: expect.objectContaining({ listFields: ['notes'] }) })));
    expect(mocks.activateModule).toHaveBeenCalledWith('workspace-1', 'vehicle-inspection', expect.objectContaining({ actorType: 'USER', actorId: 'owner' }));
    expect(await screen.findByText('Module Detail')).toBeInTheDocument();
  });

  it('uses FormRenderer for preview and creates no canonical Record', async () => {
    renderDesigner();
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'Preview Module' } });
    fireEvent.change(screen.getByLabelText(/Code/), { target: { value: 'PREVIEW_MODULE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Text' }));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Summary' } });
    const previewField = await screen.findByLabelText('Summary');
    fireEvent.change(previewField, { target: { value: 'Preview only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test Preview' }));
    expect(await screen.findByText('Preview validated successfully. No canonical Record was created.')).toBeInTheDocument();
    expect(mocks.createModule).not.toHaveBeenCalled();
    expect(mocks.updateModule).not.toHaveBeenCalled();
  });

  it('loads and versions an active Automat-generated Module through the same Designer', async () => {
    const reservation = { moduleId: 'reservation', workspaceId: 'workspace-1', moduleCode: 'RESERVATION', name: 'Reservation', description: 'Automat module', category: 'FRONT_OFFICE', status: 'ACTIVE', version: 1, createdBy: { actorType: 'INTERNAL_AGENT', actorId: 'automat' }, formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'room', label: 'Room', type: 'entity-reference', entityTypeId: 'room-type', required: true }, { key: 'guestName', label: 'Guest name', type: 'text', required: true }] }, displayConfig: { primaryField: 'room', listFields: ['room', 'guestName'] } };
    mocks.getModule.mockResolvedValue(reservation);
    mocks.updateModule.mockImplementation(async (_workspaceId, _moduleId, changes) => ({ ...reservation, ...changes, version: 2 }));
    renderDesigner('reservation');
    expect(await screen.findByDisplayValue('Reservation')).toBeInTheDocument();
    expect(screen.getByText(/publishing creates v2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Long Text' }));
    const labels = screen.getAllByLabelText('Label');
    fireEvent.change(labels[labels.length - 1], { target: { value: 'Internal Notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish v2' }));
    await waitFor(() => expect(mocks.updateModule).toHaveBeenCalledWith('workspace-1', 'reservation', expect.objectContaining({ formSchema: { schemaVersion: '1.0.0', fields: expect.arrayContaining([expect.objectContaining({ key: 'internalNotes', type: 'textarea' })]) } }), expect.objectContaining({ actorType: 'USER', actorId: 'owner' })));
    expect(mocks.activateModule).not.toHaveBeenCalled();
  });
});
