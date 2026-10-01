# Modulity 2.0

A modular operations platform that lets individuals and organizations build their own operational systems from records, modules, forms, entities, workflows, widgets and reports.

> **Step 1 — Application Foundation**
>
> The first real application foundation is in place: design system, configuration, authentication architecture, routing, responsive shell, and CI.

---

## Documentation

All architecture decisions live in `docs/`:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/PROJECT_CONSTITUTION.md](./docs/PROJECT_CONSTITUTION.md)
- [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)
- [docs/MODULE_CONTRACT.md](./docs/MODULE_CONTRACT.md)
- [docs/AGENT_ARCHITECTURE.md](./docs/AGENT_ARCHITECTURE.md)
- [docs/SECURITY_MODEL.md](./docs/SECURITY_MODEL.md)
- [docs/EVENT_MODEL.md](./docs/EVENT_MODEL.md)
- [docs/BILLING_MODEL.md](./docs/BILLING_MODEL.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/CODING_CONVENTIONS.md](./docs/CODING_CONVENTIONS.md)
- [docs/TESTING_STRATEGY.md](./docs/TESTING_STRATEGY.md)
- [docs/MIGRATION.md](./docs/MIGRATION.md)

Step 1 implementation notes:

- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
- [docs/IDENTITY.md](./docs/IDENTITY.md)
- [docs/FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)

---

## Development

```bash
npm install
```

Create a local environment file and fill in your Firebase development project values:

```bash
cp .env.example .env
```

```bash
npm run dev        # start dev server
npm run build      # production build
npm run lint       # ESLint
npm run test       # Vitest
npm run test:e2e   # Playwright (when tests exist)
```

See [docs/FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md) for Firebase configuration instructions.

---

## Project Status

- Clean rebuild from Modulity V1.
- No legacy source code imported.
- Architecture defined, runtime scaffolding initialized.
- Step 1 complete: authentication, routing, responsive shell, design system, CI.
- Next: Step 2 — Organizations, memberships, and the first core modules.
