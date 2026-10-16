import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted File command service is unavailable.');
  return httpsCallable(firebaseFunctions, 'fileCommand', { timeout: 60000 });
}

export const fileCommandClient = Object.freeze({
  async execute(command) {
    const response = await callable()({ command });
    return response.data;
  },
});
