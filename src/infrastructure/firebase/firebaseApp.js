/**
 * Modulity 2.0 — Firebase Application Instance
 *
 * Initializes the Firebase app using validated configuration. This file is the
 * only place where the Firebase app singleton is created.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import config from '../config/config.js';

function createFirebaseApp() {
  if (!config.firebase) {
    console.error(
      '[firebase] Firebase configuration is missing. Authentication will not work.',
    );
    return null;
  }

  const app = initializeApp(config.firebase);
  const auth = getAuth(app);

  const emulatorHost = import.meta.env?.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost && config.app.env === 'development') {
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
  }

  return { app, auth };
}

const firebase = createFirebaseApp();

export const firebaseApp = firebase?.app ?? null;
export const firebaseAuth = firebase?.auth ?? null;

export default firebase;
