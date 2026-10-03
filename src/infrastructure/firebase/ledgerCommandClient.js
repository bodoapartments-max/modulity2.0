import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted Ledger command service is unavailable.');
  return httpsCallable(firebaseFunctions, 'ledgerCommand', { timeout: 60000 });
}

export const ledgerCommandClient = Object.freeze({
  async execute(command) {
    const response = await callable()({ command });
    return response.data;
  },
});
