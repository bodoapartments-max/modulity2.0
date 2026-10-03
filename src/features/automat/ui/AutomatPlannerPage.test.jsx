import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import { createExistingHotelSnapshot } from '../../../agents/automat/automatFixtures.js';
import { createWorkspaceConfigurationSnapshot } from '../../../agents/automat/automatContracts.js';
import { CORE_ENTITY_TYPES } from '../../../core/data/coreEntityTypes.js';
import { createSystemPlanningOrchestrator } from '../../../agents/planning/systemPlanningOrchestrator.js';
import AutomatPlannerPage from './AutomatPlannerPage.jsx';

const mocks = vi.hoisted(() => ({ evolve: vi.fn(), persist: vi.fn(), approve: vi.fn(), apply: vi.fn(), status: vi.fn() }));
vi.mock('../../../agents/infrastructure/automatPlanning.js', () => ({ automatPlanningService: { evolve: mocks.evolve } }));
vi.mock('../../../infrastructure/firebase/automatApplyClient.js', () => ({ automatApplyClient: { persist: mocks.persist, approve: mocks.approve, apply: mocks.apply, status: mocks.status } }));

const workspace = { workspaceId: 'workspace:test-hotel', name: 'Reset Test Hotel', type: 'ORGANIZATION' };
function renderPage() { return render(<AuthContext.Provider value={{ user: { userId: 'user-1' } }}><WorkspaceContext.Provider value={{ currentWorkspace: workspace }}><AutomatPlannerPage /></WorkspaceContext.Provider></AuthContext.Provider>); }
async function evolutionResult() {
  const base = createExistingHotelSnapshot();
  const snapshot = createWorkspaceConfigurationSnapshot({ ...base, entityTypes: [...base.entityTypes, ...CORE_ENTITY_TYPES.map((item) => ({ ...item, workspaceId: base.workspaceId }))] });
  return createSystemPlanningOrchestrator().evolve({ requestId: 'request-ui', workspaceId: snapshot.workspaceId, requestedBy: 'user-1', businessRequest: 'We opened a restaurant with customer orders, suppliers and inventory.', snapshot });
}

describe('AutomatPlannerPage', () => {
  it('settles planning into a review with no Apply mutation', async () => {
    const result = await evolutionResult();
    mocks.evolve.mockImplementation(async ({ onStage }) => { onStage('WORKSPACE_ARCHITECT'); onStage('VALIDATING'); return { ...result, configurationFingerprint: 'config-hash', workspaceUnchanged: true, providerStrategy: 'DETERMINISTIC_TEST' }; });
    mocks.persist.mockResolvedValue({ planId: result.plan.planId, planFingerprint: 'plan-hash', status: 'READY_FOR_REVIEW', summary: { CREATE: 11, REUSE: 0, CONFLICT: 0, SAFE_UPDATE: 0, UNSUPPORTED: 0 } });
    renderPage();
    fireEvent.change(screen.getByLabelText(/What changed in your business/), { target: { value: 'We opened a restaurant with customer orders, suppliers and inventory.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Workspace Evolution' }));
    expect(await screen.findByText('No changes have been applied. Review reuse and creation decisions before approval.')).toBeInTheDocument();
    expect(screen.getByText('Workspace evolution')).toBeInTheDocument();
    expect(screen.getAllByText('Customer Order').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Approve Plan' })).toBeEnabled();
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace:test-hotel', planningFingerprint: 'config-hash' }));
    expect(mocks.evolve).toHaveBeenCalledWith(expect.objectContaining({ workspace, userId: 'user-1' }));
  });

  it('shows clarification without persisting or exposing approval', async () => {
    const snapshot = createExistingHotelSnapshot();
    const result = await createSystemPlanningOrchestrator().evolve({ requestId: 'request-ambiguous', workspaceId: snapshot.workspaceId, requestedBy: 'user-1', businessRequest: 'We need storage.', snapshot });
    mocks.evolve.mockResolvedValue({ ...result, configurationFingerprint: 'config-hash', workspaceUnchanged: true, providerStrategy: 'DETERMINISTIC_TEST' });
    mocks.persist.mockClear();
    renderPage();
    fireEvent.change(screen.getByLabelText(/What changed in your business/), { target: { value: 'We need storage.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Workspace Evolution' }));
    expect(await screen.findByText(/needs clarification or complete bounded coverage/)).toBeInTheDocument();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Approve Plan' })).not.toBeInTheDocument();
  });

  it('settles provider failure into an actionable error state', async () => {
    mocks.evolve.mockRejectedValue(new Error('Planning provider failed safely'));
    renderPage();
    fireEvent.change(screen.getByLabelText(/What changed in your business/), { target: { value: 'We need room inspections.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Workspace Evolution' }));
    expect(await screen.findByText('Planning provider failed safely')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyze Workspace Evolution' })).not.toBeDisabled());
  });
});
