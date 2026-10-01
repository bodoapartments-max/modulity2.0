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
npm run test         # Vitest (unit/component tests)
npm run test:rules   # Firestore Security Rules tests (requires emulator)
npm run test:e2e     # Playwright (when tests exist)
```

## Where to Find Things

| Concern                   | Location                                       |
| ------------------------- | ---------------------------------------------- |
| Architecture decisions    | `docs/`                                        |
| App shell / routing       | `src/app/`                                     |
| Business logic subsystems | `src/core/`                                    |
| Workspace / People        | `src/core/workspace/`                          |
| Event bus                 | `src/core/events/`                             |
| Module engine             | `src/modules/`                                 |
| Agent layer               | `src/agents/`                                  |
| User-facing features      | `src/features/<feature>/ui/` + `model.js`      |
| Reusable UI               | `src/design-system/`                           |
| External integrations     | `src/integrations/`                            |
| Infrastructure adapters   | `src/infrastructure/`                          |
| Firestore repositories    | `src/infrastructure/firebase/firestore*.js`    |
| Service wiring            | `src/infrastructure/services.js`               |
| Repository wiring         | `src/infrastructure/repositories.js`           |
| Workspace context         | `src/app/providers/WorkspaceProvider.jsx`       |
| Tests                     | Next to source (`*.test.jsx`, `*.test.js`)     |

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

## Step 2 Architecture Notes

- **Workspace** is the central operating context. All future modules/records operate within a workspace.
- **User != Person != Membership != Employee != Role** — see `docs/WORKSPACE_MODEL.md`.
- **Services** are React-independent: `core/workspace/*Service.js`. They can be consumed by web, mobile, agents, or API.
- **Repositories** follow a contract pattern: `core/workspace/*Repository.js` (contract) → `infrastructure/firebase/firestore*.js` (implementation).
- **WorkspaceProvider** initializes personal workspace + profile on first login, loads accessible workspaces, handles switching.
- **Events** use the bus at `core/events/eventBus.js`. Services emit events for audit/tracking.
- **Firestore Security Rules** are in `firestore.rules`. Application-layer checks complement them.

## Step 2.1 Security Architecture

- **Memberships** are subcollections at `organizations/{orgId}/members/{userId}` — deterministic path for Security Rules lookups.
- **Groups and Invitations** are also subcollections under `organizations/{orgId}/`.
- **User membership index** at `userMemberships/{userId}/orgs/{orgId}` enables "get my orgs" queries.
- **Organization creation** uses atomic `writeBatch()` — org + workspace + membership + index in one commit.
- **Security Rules** enforce organization isolation, role-based access, field immutability, and deny-by-default independently of app code.
- **Security Rules tests** are in `tests/rules/` and run against the Firebase Emulator Suite.

### Adding New Organization-Scoped Collections

**NO NEW WORKSPACE-SCOPED FIRESTORE COLLECTION MAY BE ADDED WITHOUT EXPLICIT SECURITY RULES AND CROSS-WORKSPACE NEGATIVE TESTS.**

1. Place as subcollection under `organizations/{orgId}/`
2. Add `isActiveMember(organizationId)` read rule
3. Add appropriate write rules (e.g. `isAdminOrOwner`)
4. Add cross-org negative tests in `tests/rules/`
5. Document in `docs/SECURITY_MODEL.md`

## Migration Note

This is a clean rebuild. Modulity V1 is only a reference and must not be copied.
