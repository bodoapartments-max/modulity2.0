import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import AutomatApplyPanel from './AutomatApplyPanel.jsx';

const mocks = vi.hoisted(() => ({ approve: vi.fn(), apply: vi.fn(), status: vi.fn() }));
vi.mock('../../../infrastructure/firebase/automatApplyClient.js', () => ({ automatApplyClient: mocks }));

const workspace = { workspaceId: 'workspace-1', name: 'Reset Test Hotel' };
const plan = { planId: 'plan-1', planFingerprint: 'hash-1', status: 'READY_FOR_REVIEW', summary: { CREATE: 11, REUSE: 0, SAFE_UPDATE: 0, CONFLICT: 0, UNSUPPORTED: 0 } };

describe('AutomatApplyPanel', () => {
  it('requires trusted approval and exact final confirmation before apply', async () => {
    const invalidate = vi.spyOn(workspaceQueryCache, 'invalidate');
    mocks.approve.mockResolvedValue({ ...plan, status: 'APPROVED' });
    mocks.apply.mockResolvedValue({ operationId: 'operation-1', status: 'APPLIED', phase: 'COMPLETE', resourceResults: [{ status: 'SUCCESS' }] });
    render(<AutomatApplyPanel workspace={workspace} persistedPlan={plan} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Plan' }));
    expect(await screen.findByText('Apply this system plan to Reset Test Hotel')).toBeInTheDocument();
    const applyButton = screen.getByRole('button', { name: 'Apply System Plan' });
    expect(applyButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the confirmation phrase'), { target: { value: 'wrong' } });
    expect(applyButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the confirmation phrase'), { target: { value: 'Apply this system plan to Reset Test Hotel' } });
    fireEvent.click(applyButton);
    expect(await screen.findByText(/System plan applied and verified/)).toBeInTheDocument();
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1', planId: 'plan-1' }));
    expect(invalidate).toHaveBeenCalledWith('workspace-1:');
  });

  it('blocks approval when conflicts exist', () => {
    render(<AutomatApplyPanel workspace={workspace} persistedPlan={{ ...plan, summary: { ...plan.summary, CONFLICT: 1 } }} />);
    expect(screen.getByRole('button', { name: 'Approve Plan' })).toBeDisabled();
  });
});
