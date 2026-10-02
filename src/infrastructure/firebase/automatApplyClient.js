import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function planCallable() {
  if (!firebaseFunctions) throw new Error('Trusted Automat plan service is unavailable.');
  return httpsCallable(firebaseFunctions, 'automatPlan', { timeout: 120000 });
}

function applyCallable() {
  if (!firebaseFunctions) throw new Error('Trusted Automat apply service is unavailable.');
  return httpsCallable(firebaseFunctions, 'automatApplyPlan', { timeout: 540000 });
}

export const automatApplyClient = Object.freeze({
  async persist({ workspaceId, plan, planningFingerprint }) { return (await planCallable()({ action: 'PERSIST', workspaceId, plan, planningFingerprint })).data; },
  async approve({ workspaceId, planId, planFingerprint }) { return (await planCallable()({ action: 'APPROVE', workspaceId, planId, planFingerprint })).data; },
  async getPlan({ workspaceId, planId }) { return (await planCallable()({ action: 'GET', workspaceId, planId })).data; },
  async apply({ workspaceId, planId, operationId }) { return (await applyCallable()({ action: 'APPLY', workspaceId, planId, operationId })).data; },
  async status({ workspaceId, operationId }) { return (await applyCallable()({ action: 'STATUS', workspaceId, operationId })).data; },
});
