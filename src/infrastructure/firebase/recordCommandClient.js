import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebaseApp.js';

function callable() {
  if (!firebaseFunctions) throw new Error('Trusted Record command service is unavailable.');
  return httpsCallable(firebaseFunctions, 'recordCommand', { timeout: 60000 });
}

export const recordCommandClient = Object.freeze({
  async execute(command) {
    const response = await callable()({ command });
    return response.data;
  },
});
