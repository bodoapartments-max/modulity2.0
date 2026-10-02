import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import { createWorkspaceConfigurationSnapshot } from '../../../agents/automat/automatContracts.js';
import { createSystemPlanningOrchestrator } from '../../../agents/planning/systemPlanningOrchestrator.js';
import AutomatPlannerPage from './AutomatPlannerPage.jsx';

const mocks = vi.hoisted(() => ({ plan: vi.fn(), persist: vi.fn(), approve: vi.fn(), apply: vi.fn(), status: vi.fn() }));
vi.mock('../../../infrastructure/automatPlanning.js', () => ({ automatPlanningService: { plan: mocks.plan } }));
vi.mock('../../../infrastructure/firebase/automatApplyClient.js', () => ({ automatApplyClient: { persist: mocks.persist, approve: mocks.approve, apply: mocks.apply, status: mocks.status } }));

const workspace = { workspaceId: 'workspace-1', name: 'Reset Test Hotel', type: 'ORGANIZATION' };
function renderPage() { return render(<AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><AutomatPlannerPage /></WorkspaceContext.Provider></AuthContext.Provider>); }
async function hotelResult() {
  const organizationInput = { schemaVersion: '1.0.0', workspaceId: 'workspace-1', organizationName: 'Reset Test Hotel', description: '', userDescription: 'I run a 40-room hotel with housekeeping and maintenance.', existingConfiguration: {} };
  return createSystemPlanningOrchestrator().plan({ requestId: 'request-ui', workspaceId: 'workspace-1', requestedBy: 'user-1', organizationInput, snapshot: createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1' }) });
}

describe('AutomatPlannerPage', () => {
  it('settles planning into a review with no Apply mutation', async () => {
    const result = await hotelResult();
    mocks.plan.mockImplementation(async ({ onStage }) => { onStage('ORGANIZATION_ANALYZER'); onStage('MODULE_PLANNER'); onStage('VALIDATING'); return { ...result, configurationFingerprint: 'config-hash', workspaceUnchanged: true, providerStrategy: 'DETERMINISTIC_TEST' }; });
    mocks.persist.mockResolvedValue({ planId: result.plan.planId, planFingerprint: 'plan-hash', status: 'READY_FOR_REVIEW', summary: { CREATE: 11, REUSE: 0, CONFLICT: 0, SAFE_UPDATE: 0, UNSUPPORTED: 0 } });
    renderPage();
    fireEvent.change(screen.getByLabelText(/Describe your organization/), { target: { value: 'I run a 40-room hotel with housekeeping and maintenance.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build System Plan' }));
    expect(await screen.findByText('No changes have been applied to this Workspace. This plan is ready for human review only.')).toBeInTheDocument();
    expect(screen.getByText('Front Office')).toBeInTheDocument();
    expect(screen.getAllByText('Reservation').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Approve Plan' })).toBeEnabled();
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', planningFingerprint: 'config-hash' }));
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
