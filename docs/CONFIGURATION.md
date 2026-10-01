# Modulity 2.0 — Configuration

Configuration is centralized in `src/infrastructure/config/config.js`.

## Loading configuration

Application code should import the resolved config object:

```js
import config from './infrastructure/config/config.js';

console.log(config.app.env);
console.log(config.limits.maxConnections);
```

Do not read `import.meta.env` directly outside the configuration module.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_APP_NAME` | Application display name | `Modulity` |
| `VITE_APP_ENV` | Runtime environment | `development` |
| `VITE_FIREBASE_API_KEY` | Firebase API key | required |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | required |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | required |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket | required |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | required |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | required |
| `VITE_IDENTITY_PROVIDER` | Active identity adapter | `firebase` |
| `VITE_MAX_CONNECTIONS` | Default connection entitlement limit | `5` |

## Validation

The configuration loader throws `ConfigError` when required values are missing in non-test environments. This guarantees the application fails clearly instead of running with a broken Firebase setup.

## Defaults

Default limits such as `MAX_CONNECTIONS = 5` come from configuration, not from business logic. See `docs/BILLING_MODEL.md`.
