/**
 * Trusted Chat command client (Step 18).
 */
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';
import { buildChatCommand, CHAT_COMMAND_TYPES } from '../../core/chat/chatCommandContract.js';
import { generateId } from '../../core/utils/generateId.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted chat service is unavailable.');
  return httpsCallable(firebaseFunctions, 'chatCommand', { timeout: 60000 });
}

export const chatCommandClient = Object.freeze({
  CHAT_COMMAND_TYPES,
  async execute(commandType, payload, operationId = generateId()) {
    const response = await callable()({ command: buildChatCommand(commandType, { operationId, ...payload }) });
    return response.data;
  },
});
