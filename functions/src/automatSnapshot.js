import { createWorkspaceConfigurationSnapshot } from './generated/src/agents/automat/automatContracts.js';
import { fingerprintValue } from './generated/src/agents/automat/planIntegrity.js';

const specs = [
  ['entityTypes', 'entityTypes', 'typeId'], ['modules', 'modules', 'moduleId'], ['relationships', 'relationships', 'relationshipId'],
  ['worksets', 'worksets', 'worksetId'], ['widgets', 'widgetDefinitions', 'widgetId'], ['reports', 'reportDefinitions', 'reportId'],
];

export async function loadAdminWorkspaceSnapshot(db, workspaceId) {
  const values = await Promise.all(specs.map(async ([, collection, idField]) => {
    const snapshot = await db.collection(`workspaces/${workspaceId}/${collection}`).limit(100).get();
    return snapshot.docs.map((document) => ({ ...document.data(), [idField]: document.id }));
  }));
  return createWorkspaceConfigurationSnapshot({ workspaceId, ...Object.fromEntries(specs.map(([key], index) => [key, values[index]])) });
}

export async function configurationFingerprint(db, workspaceId) {
  return fingerprintValue(await loadAdminWorkspaceSnapshot(db, workspaceId));
}
