import { fingerprintValue } from '../agents/automat/planIntegrity.js';
import { createSystemPlanningOrchestrator } from '../agents/planning/systemPlanningOrchestrator.js';
import { createWorkspaceSnapshotService } from '../agents/planning/workspaceSnapshotService.js';
import { repositories } from './repositories.js';

const developmentCapabilityResolver = async (capability, context) => Boolean(context.workspaceId && context.requestedBy && ['automat.organization_analysis', 'automat.system_builder'].includes(capability));

export function createAutomatPlanningService({ snapshotService = createWorkspaceSnapshotService({ repositories }), planner = createSystemPlanningOrchestrator({ canUse: developmentCapabilityResolver }) } = {}) {
  return {
    async plan({ requestId, workspace, userId, organizationInput, onStage }) {
      if (!workspace?.workspaceId || !userId || organizationInput.workspaceId !== workspace.workspaceId) throw new Error('Current authenticated Workspace is required for planning');
      const before = await snapshotService.load(workspace.workspaceId, userId);
      const result = await planner.plan({ requestId, workspaceId: workspace.workspaceId, requestedBy: userId, organizationInput, snapshot: before, onStage });
      const after = await snapshotService.load(workspace.workspaceId, userId);
      snapshotService.assertUnchanged(before, after);
      return Object.freeze({ ...result, snapshot: before, configurationFingerprint: await fingerprintValue(before), workspaceUnchanged: true, providerStrategy: 'DETERMINISTIC_TEST' });
    },
  };
}

export const automatPlanningService = repositories ? createAutomatPlanningService() : null;
