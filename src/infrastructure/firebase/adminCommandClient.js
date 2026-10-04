/**
 * Trusted Administration command client (Step 17.3).
 *
 * Browsers call the `adminCommand` callable; no direct Firestore write is
 * authority for protected administration. Works the same from any future
 * client (Mobile/WordPress/External API) — the boundary is React-free.
 */
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';
import { buildAdminCommand, ADMIN_COMMAND_TYPES } from '../../core/admin/adminCommandContract.js';
import { generateId } from '../../core/utils/generateId.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted administration service is unavailable.');
  return httpsCallable(firebaseFunctions, 'adminCommand', { timeout: 120000 });
}

export const adminCommandClient = Object.freeze({
  ADMIN_COMMAND_TYPES,

  async execute(commandType, payload, operationId = generateId()) {
    const command = buildAdminCommand(commandType, { operationId, ...payload });
    const response = await callable()({ command });
    return response.data;
  },
});
