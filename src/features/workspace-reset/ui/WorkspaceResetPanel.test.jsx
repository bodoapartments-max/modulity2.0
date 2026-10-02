import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import WorkspaceResetPanel from './WorkspaceResetPanel.jsx';

const mocks = vi.hoisted(() => ({ plan: vi.fn(), execute: vi.fn() }));
vi.mock('../../../infrastructure/firebase/workspaceResetClient.js', () => ({ workspaceResetClient: mocks }));

const workspace = { workspaceId: 'ws-1', name: 'Test Hotel', type: 'ORGANIZATION' };
function renderPanel() {
  return render(<WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><WorkspaceResetPanel /></WorkspaceContext.Provider>);
}

describe('WorkspaceResetPanel', () => {
  it('requires an authoritative plan and exact typed Workspace name', async () => {
    mocks.plan.mockResolvedValue({ workspaceId: 'ws-1', workspaceName: 'Test Hotel', mode: 'WORKSPACE_DATA_RESET', estimatedTotalDocuments: 12, preserve: [] });
    mocks.execute.mockResolvedValue({ status: 'SUCCESS' });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Workspace' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    const destructive = screen.getByRole('button', { name: 'Permanently Reset Workspace' });
    expect(destructive).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the Workspace name to confirm'), { target: { value: 'RESET' } });
    expect(destructive).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the Workspace name to confirm'), { target: { value: 'Test Hotel' } });
    expect(destructive).toBeEnabled();
    fireEvent.click(destructive);
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', confirmation: 'Test Hotel' })));
  });
});
