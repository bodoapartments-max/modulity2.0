# Features

This folder contains user-facing feature modules of Modulity 2.0.

Each feature follows the structure:

```
features/<feature>/
  ui/          — React components
  model.js     — data fetching, state, business logic
  hooks/       — custom hooks (optional)
  README.md    — feature overview (if complex)
```

## Current Features (planned)

- `listview` — reusable Record List Engine
- `folders` — workspace and personal folders
- `favorites` — personal lightweight favorites
- `sharing` — share records and forms
- `notifications` — event-driven notifications
- `chat` — messaging platform capability
- `widgets` — configuration-driven dashboard widgets
- `reports` — configuration-driven cross-module reports
- `worksets` — module packs / context-aware toolsets

## Rules

- UI is presentational; logic lives in `model.js` or hooks.
- Features depend on `core/` and `modules/` contracts.
- Features do not depend on each other's internals; communicate through events or shared Core services.
