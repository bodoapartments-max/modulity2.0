import { AUTOMAT_BOUNDS, createWorkspaceConfigurationSnapshot } from '../automat/automatContracts.js';

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};

export function snapshotFingerprint(snapshot) {
  return JSON.stringify(stable(snapshot));
}

export function createWorkspaceSnapshotService({ repositories }) {
  if (!repositories) throw new Error('Planning snapshot repositories are required');
  return {
    async load(workspaceId, userId) {
      if (!workspaceId || !userId) throw new Error('Workspace snapshot identity is required');
      const max = AUTOMAT_BOUNDS.MAX_SNAPSHOT_ITEMS_PER_TYPE;
      const [entityTypes, modules, relationships, worksets, widgets, reports] = await Promise.all([
        repositories.entityTypes.listByWorkspace(workspaceId, max),
        repositories.modules.listByWorkspace(workspaceId, max),
        repositories.relationships.listByWorkspace(workspaceId, max),
        repositories.worksets.listByWorkspace(workspaceId),
        repositories.widgets.listByWorkspace(workspaceId),
        repositories.reports.listByWorkspace(workspaceId),
      ]);
      return createWorkspaceConfigurationSnapshot({ workspaceId, entityTypes, modules, relationships, worksets, widgets, reports });
    },
    assertUnchanged(before, after) {
      if (before.workspaceId !== after.workspaceId || snapshotFingerprint(before) !== snapshotFingerprint(after)) throw new Error('Workspace configuration changed during planning');
      return true;
    },
  };
}
