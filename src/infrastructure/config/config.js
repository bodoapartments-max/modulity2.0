/**
 * Modulity 2.0 — Centralized Configuration Loader
 *
 * Loads and validates environment-based configuration. All application code
 * should read configuration through this module rather than accessing
 * import.meta.env directly.
 */

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function parseIntEnv(env, key, fallback) {
  const raw = env?.[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(`Configuration ${key} must be a valid integer`);
  }
  return parsed;
}

export function createConfig(env = import.meta.env) {
  const wrappedEnv = {
    get: (key, fallback) => {
      const value = env?.[key];
      if (value === undefined || value === '') return fallback;
      return value;
    },
    require: (key) => {
      const value = env?.[key];
      if (value === undefined || value === '') {
        throw new ConfigError(`Missing required configuration: ${key}`);
      }
      return value;
    },
  };

  const appName = wrappedEnv.get('VITE_APP_NAME', 'Modulity');
  const appEnv = wrappedEnv.get('VITE_APP_ENV', 'development');

  const firebaseConfig = {
    apiKey: wrappedEnv.get('VITE_FIREBASE_API_KEY'),
    authDomain: wrappedEnv.get('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: wrappedEnv.get('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: wrappedEnv.get('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: wrappedEnv.get('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: wrappedEnv.get('VITE_FIREBASE_APP_ID'),
  };

  const firebaseEnabled = Object.values(firebaseConfig).every(
    (value) => typeof value === 'string' && value.length > 0,
  );

  if (!firebaseEnabled && appEnv !== 'test') {
    // In test mode we allow missing Firebase config because tests mock the adapter.
    // In other environments we surface a clear error early.
    throw new ConfigError(
      'Firebase configuration is incomplete. Set all VITE_FIREBASE_* environment variables or use the test adapter.',
    );
  }

  const identityProvider = wrappedEnv.get('VITE_IDENTITY_PROVIDER', 'firebase');
  const maxConnections = parseIntEnv(env, 'VITE_MAX_CONNECTIONS', 5);

  return Object.freeze({
    app: {
      name: appName,
      env: appEnv,
    },
    firebase: firebaseEnabled ? firebaseConfig : null,
    identityProvider,
    limits: {
      maxConnections,
    },
    features: {
      /** Reserved for capability flags. */
    },
  });
}

/**
 * Resolved application configuration.
 *
 * The first call validates the environment. Subsequent calls return the cached value.
 */
export const config = createConfig();

export default config;
