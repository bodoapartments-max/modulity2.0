# Modulity 2.0 — Agent Guide

This file contains practical guidance for anyone (human or coding agent) working on Modulity 2.0.

## Project Type

React + Vite + Tailwind CSS application. JavaScript/JSX. Design tokens live in `src/design-system/tokens.js`.

## Quick Commands

```bash
npm install
npm run dev          # start dev server
npm run build        # production build
npm run lint         # ESLint
npm run test         # Vitest
npm run test:e2e     # Playwright (when tests exist)
```

## Where to Find Things

| Concern                   | Location                                   |
| ------------------------- | ------------------------------------------ |
| Architecture decisions    | `docs/`                                    |
| App shell / routing       | `src/app/`                                 |
| Business logic subsystems | `src/core/`                                |
| Module engine             | `src/modules/`                             |
| Agent layer               | `src/agents/`                              |
| User-facing features      | `src/features/<feature>/ui/` + `model.js`  |
| Reusable UI               | `src/design-system/`                       |
| External integrations     | `src/integrations/`                        |
| Infrastructure adapters   | `src/infrastructure/`                      |
| Tests                     | Next to source (`*.test.jsx`, `*.test.js`) |

## Rules of Thumb

- The canonical object is a **Record**. Do not duplicate Records for different views.
- Core works without agents. Agents are optional and never bypass security.
- Dependencies point inward: `app` → `features`/`modules` → `core` → `infrastructure`.
- Never put business logic in presentational components.
- Never put permission decisions only in React conditional rendering.
- Always use design tokens; no hardcoded colors or spacing.
- Keep tests next to the code they test.
- Update `docs/` and `CHANGELOG.md` when structure or contracts change.
- Do not import code from Modulity V1 unless explicitly approved.

## Migration Note

This is a clean rebuild. Modulity V1 is only a reference and must not be copied.
