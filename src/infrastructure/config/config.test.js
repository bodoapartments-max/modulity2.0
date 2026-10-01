import { describe, it, expect } from 'vitest';
import { createConfig, ConfigError } from './config.js';

describe('createConfig', () => {
  const baseEnv = {
    VITE_APP_NAME: 'Modulity Test',
    VITE_APP_ENV: 'test',
    VITE_FIREBASE_API_KEY: 'test-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'test-project',
    VITE_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123456',
    VITE_FIREBASE_APP_ID: '1:123:web:test',
    VITE_IDENTITY_PROVIDER: 'firebase',
    VITE_MAX_CONNECTIONS: '3',
  };

  it('returns validated configuration', () => {
    const cfg = createConfig(baseEnv);

    expect(cfg.app.name).toBe('Modulity Test');
    expect(cfg.app.env).toBe('test');
    expect(cfg.firebase.apiKey).toBe('test-api-key');
    expect(cfg.identityProvider).toBe('firebase');
    expect(cfg.limits.maxConnections).toBe(3);
  });

  it('uses defaults when optional values are missing', () => {
    const env = {
      ...baseEnv,
      VITE_APP_NAME: '',
      VITE_MAX_CONNECTIONS: '',
    };

    const cfg = createConfig(env);

    expect(cfg.app.name).toBe('Modulity');
    expect(cfg.limits.maxConnections).toBe(5);
  });

  it('throws ConfigError when Firebase config is incomplete in non-test env', () => {
    const env = {
      VITE_APP_ENV: 'development',
      VITE_FIREBASE_API_KEY: '',
    };

    expect(() => createConfig(env)).toThrow(ConfigError);
  });

  it('throws ConfigError for invalid integer', () => {
    const env = {
      ...baseEnv,
      VITE_MAX_CONNECTIONS: 'not-a-number',
    };

    expect(() => createConfig(env)).toThrow(ConfigError);
  });
});
