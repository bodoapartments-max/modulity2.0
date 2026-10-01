/**
 * Modulity 2.0 — Configured Identity Provider
 *
 * Exports the active IdentityProvider implementation based on application
 * configuration. Higher layers import this singleton instead of selecting an
 * adapter themselves.
 */

import { validateIdentityProvider } from '../../core/identity/identityContract.js';
import { createFirebaseIdentityAdapter } from '../firebase/firebaseIdentityAdapter.js';
import { firebaseAuth } from '../firebase/firebaseApp.js';
import config from '../config/config.js';

function createProvider() {
  switch (config.identityProvider) {
    case 'firebase':
      return createFirebaseIdentityAdapter(firebaseAuth);
    default:
      throw new Error(`Unsupported identity provider: ${config.identityProvider}`);
  }
}

export const identityProvider = createProvider();
validateIdentityProvider(identityProvider);

export default identityProvider;
