import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted Approval command service is unavailable.');
  return httpsCallable(firebaseFunctions, 'approvalCommand', { timeout: 60000 });
}

export const approvalCommandClient = Object.freeze({
  async execute(command) {
    const response = await callable()({ command });
    return response.data;
  },
});
