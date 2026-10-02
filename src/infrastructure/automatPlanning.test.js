import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceConfigurationSnapshot } from '../agents/automat/automatContracts.js';
import { createAutomatPlanningService } from './automatPlanning.js';

const workspace = { workspaceId: 'workspace-1', name: 'Test Hotel' };
const organizationInput = { schemaVersion: '1.0.0', workspaceId: 'workspace-1', organizationName: 'Test Hotel', description: '', userDescription: 'I run a hotel with rooms, housekeeping and maintenance.', existingConfiguration: {} };

describe('Automat planning application boundary', () => {
  it('compares before/after configuration and performs no canonical mutation', async () => {
    const snapshot = createWorkspaceConfigurationSnapshot({ workspaceId: 'workspace-1' });
    const snapshotService = { load: vi.fn().mockResolvedValue(snapshot), assertUnchanged: vi.fn().mockReturnValue(true) };
    const result = await createAutomatPlanningService({ snapshotService }).plan({ requestId: 'request-1', workspace, userId: 'user-1', organizationInput });
    expect(snapshotService.load).toHaveBeenNthCalledWith(1, 'workspace-1', 'user-1');
    expect(snapshotService.load).toHaveBeenNthCalledWith(2, 'workspace-1', 'user-1');
    expect(snapshotService.assertUnchanged).toHaveBeenCalledWith(snapshot, snapshot);
    expect(result.workspaceUnchanged).toBe(true);
    expect(result.plan.status).toBe('READY_FOR_REVIEW');
    expect(result).not.toHaveProperty('apply');
  });

  it('rejects arbitrary Workspace IDs before snapshot reads', async () => {
    const snapshotService = { load: vi.fn(), assertUnchanged: vi.fn() };
    await expect(createAutomatPlanningService({ snapshotService }).plan({ requestId: 'request-1', workspace, userId: 'user-1', organizationInput: { ...organizationInput, workspaceId: 'other' } })).rejects.toThrow('Current authenticated Workspace');
    expect(snapshotService.load).not.toHaveBeenCalled();
  });
});
