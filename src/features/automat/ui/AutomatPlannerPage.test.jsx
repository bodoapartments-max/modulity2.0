import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import { createWorkspaceConfigurationSnapshot } from '../../../agents/automat/automatContracts.js';
import { createSystemPlanningOrchestrator } from '../../../agents/planning/systemPlanningOrchestrator.js';
import AutomatPlannerPage from './AutomatPlannerPage.jsx';

const mocks = vi.hoisted(() => ({ plan: vi.fn() }));
vi.mock('../../../infrastructure/automatPlanning.js', () => ({ automatPlanningService: { plan: mocks.plan } }));

const workspace = { workspaceId: 'workspace-1', name: 'Reset Test Hotel', type: 'ORGANIZATION' };
function renderPage() { return render(<AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><AutomatPlannerPage /></WorkspaceContext.Provider></AuthContext.Provider>); }
async function hotelResult() {
  const organizationInput = { schemaVersion: '1.0.0', workspaceId: 'workspace-1', organizationName: 'Reset Test Hotel', description: '', userDescription: 'I run a 40-room hotel with housekeeping and maintenance.', existingConfiguration: {} };
  return createSystemPlanningOrchestrator().plan({ requestId: 'request-ui', workspaceId: 'workspace-1', requestedBy: 'user-1', organizationInput, snapshot: createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1' }) });
}

describe('AutomatPlannerPage', () => {
  it('settles planning into a review with no Apply mutation', async () => {
    const result = await hotelResult();
    mocks.plan.mockImplementation(async ({ onStage }) => { onStage('ORGANIZATION_ANALYZER'); onStage('MODULE_PLANNER'); onStage('VALIDATING'); return { ...result, workspaceUnchanged: true, providerStrategy: 'DETERMINISTIC_TEST' }; });
    renderPage();
    fireEvent.change(screen.getByLabelText(/Describe your organization/), { target: { value: 'I run a 40-room hotel with housekeeping and maintenance.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build System Plan' }));
    expect(await screen.findByText('No changes have been applied to this Workspace. This plan is ready for human review only.')).toBeInTheDocument();
    expect(screen.getByText('Front Office')).toBeInTheDocument();
    expect(screen.getAllByText('Reservation').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Apply plan — future step' })).toBeDisabled();
    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({ workspace, userId: 'user-1' }));
  });

  it('settles provider failure into an actionable error state', async () => {
    mocks.plan.mockRejectedValue(new Error('Planning provider failed safely'));
    renderPage();
    fireEvent.change(screen.getByLabelText(/Describe your organization/), { target: { value: 'I operate a theatre with live shows.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build System Plan' }));
    expect(await screen.findByText('Planning provider failed safely')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build System Plan' })).not.toBeDisabled());
  });
});
