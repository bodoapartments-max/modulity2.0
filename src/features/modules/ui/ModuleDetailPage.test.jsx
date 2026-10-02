import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import EditModulePage from './EditModulePage.jsx';
import ModuleDetailPage from './ModuleDetailPage.jsx';

const mocks = vi.hoisted(() => ({ getModule: vi.fn(), updateModule: vi.fn() }));
vi.mock('../../../infrastructure/services.js', () => ({ default: { module: { getModule: mocks.getModule, updateModule: mocks.updateModule } } }));

describe('ModuleDetailPage identity boundary', () => {
  it('uses normalized userId without requiring Firebase uid', async () => {
    mocks.getModule.mockResolvedValue({ moduleId: 'module-1', moduleCode: 'TEST', name: 'Test Module', status: 'DRAFT', version: 1, formSchema: { fields: [] }, recordConfig: { recordType: 'TEST' } });
    render(<MemoryRouter initialEntries={['/app/modules/module-1']}><AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1' } }}><Routes><Route path="/app/modules/:moduleId" element={<ModuleDetailPage />} /></Routes></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>);
    expect(await screen.findByText('Test Module')).toBeInTheDocument();
  });

  it('uses normalized userId when editing without requiring Firebase uid', async () => {
    mocks.getModule.mockResolvedValue({ moduleId: 'module-1', moduleCode: 'TEST', name: 'Test Module', status: 'DRAFT', version: 1, formSchema: { fields: [] }, recordConfig: { recordType: 'TEST' } });
    mocks.updateModule.mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={['/app/modules/module-1/edit']}><AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1' } }}><Routes><Route path="/app/modules/:moduleId/edit" element={<EditModulePage />} /><Route path="/app/modules/:moduleId" element={<div>Saved</div>} /></Routes></WorkspaceContext.Provider></AuthContext.Provider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.updateModule).toHaveBeenCalledWith('ws-1', 'module-1', expect.any(Object), { actorType: 'USER', actorId: 'user-1' }));
  });
});
