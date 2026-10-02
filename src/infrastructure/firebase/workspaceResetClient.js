import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted Workspace reset service is unavailable.');
  return httpsCallable(firebaseFunctions, 'workspaceReset', { timeout: 540000 });
}

export const workspaceResetClient = Object.freeze({
  async plan(workspaceId) {
    const response = await callable()({ action: 'PLAN', mode: 'WORKSPACE_DATA_RESET', workspaceId });
    return response.data;
  },
  async execute({ workspaceId, requestId, confirmation }) {
    const response = await callable()({ action: 'EXECUTE', mode: 'WORKSPACE_DATA_RESET', workspaceId, requestId, confirmation });
    return response.data;
  },
});
