import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EntityFormPage from './EntityFormPage.jsx';

const mocks = vi.hoisted(() => ({ getEntityType: vi.fn(), getEntity: vi.fn(), createEntity: vi.fn(), updateEntity: vi.fn() }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { entityType: { getEntityType: mocks.getEntityType }, entity: { getEntity: mocks.getEntity, createEntity: mocks.createEntity, updateEntity: mocks.updateEntity } } }));
const type = { typeId: 'core:employee', code: 'EMPLOYEE', name: 'Employee', category: 'CORE', schemaVersion: '1.0.0', fields: [{ key: 'firstName', label: 'First Name', type: 'text', required: true }, { key: 'lastName', label: 'Last Name', type: 'text', required: true }, { key: 'position', label: 'Position', type: 'text', required: false }] };
function renderPage(path) { return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={{ user: { userId: 'owner' } }}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}><Routes><Route path="/app/entity-types/:entityTypeId/entities/new" element={<EntityFormPage />} /><Route path="/app/entities/:entityId/edit" element={<EntityFormPage />} /><Route path="/app/entities/:entityId" element={<div>Entity Detail</div>} /></Routes></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>); }

beforeEach(() => { mocks.getEntityType.mockResolvedValue(type); });

describe('generic Entity Create/Edit form', () => {
  it('creates a Core Entity instance through canonical EntityService', async () => {
    mocks.createEntity.mockResolvedValue({ entityId: 'employee-1' });
    renderPage('/app/entity-types/core%3Aemployee/entities/new');
    fireEvent.change(await screen.findByLabelText(/Display Name/), { target: { value: 'Anna Smith' } });
    fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: 'Anna' } });
    fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Employee' }));
    await waitFor(() => expect(mocks.createEntity).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', entityTypeId: 'core:employee', displayName: 'Anna Smith', data: expect.objectContaining({ firstName: 'Anna', lastName: 'Smith' }) })));
    expect(await screen.findByText('Entity Detail')).toBeInTheDocument();
  });

  it('edits canonical Entity data without rewriting Records', async () => {
    mocks.getEntity.mockResolvedValue({ entityId: 'employee-1', entityTypeId: 'core:employee', displayName: 'Anna Smith', status: 'ACTIVE', data: { firstName: 'Anna', lastName: 'Smith', position: 'Reception' } });
    mocks.updateEntity.mockResolvedValue({ entityId: 'employee-1' });
    renderPage('/app/entities/employee-1/edit');
    const position = await screen.findByLabelText(/Position/);
    fireEvent.change(position, { target: { value: 'Manager' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Employee' }));
    await waitFor(() => expect(mocks.updateEntity).toHaveBeenCalledWith('workspace-1', 'employee-1', expect.objectContaining({ data: expect.objectContaining({ position: 'Manager' }) }), { actorType: 'USER', actorId: 'owner' }));
  });
});
