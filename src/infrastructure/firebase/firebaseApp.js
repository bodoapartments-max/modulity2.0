/**
 * Modulity 2.0 — Firebase Application Instance
 *
 * Initializes the Firebase app using validated configuration. This file is the
 * only place where the Firebase app singleton is created.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
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
  const db = getFirestore(app);
  const functions = getFunctions(app, 'europe-west1');

  const emulatorHost = import.meta.env?.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost && config.app.env === 'development') {
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
  }

  const firestoreEmulatorHost = import.meta.env?.VITE_FIRESTORE_EMULATOR_HOST;
  if (firestoreEmulatorHost && config.app.env === 'development') {
    const [configuredHost, port] = firestoreEmulatorHost.split(':');
    const host = configuredHost === 'localhost' ? '127.0.0.1' : configuredHost;
    connectFirestoreEmulator(db, host, Number(port));
  }
  const functionsEmulatorHost = import.meta.env?.VITE_FUNCTIONS_EMULATOR_HOST;
  if (functionsEmulatorHost && config.app.env === 'development') {
    const [configuredHost, port] = functionsEmulatorHost.split(':');
    connectFunctionsEmulator(functions, configuredHost === 'localhost' ? '127.0.0.1' : configuredHost, Number(port));
  }

  return { app, auth, db, functions };
}

const firebase = createFirebaseApp();

export const firebaseApp = firebase?.app ?? null;
export const firebaseAuth = firebase?.auth ?? null;
export const firebaseDb = firebase?.db ?? null;
export const firebaseFunctions = firebase?.functions ?? null;

export default firebase;
