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

## Step 3 — Universal Data Core

Step 3 added the universal data layer under `src/core/data/`:

| File | Purpose |
|------|---------|
| `actorRef.js` | Typed actor identity (USER, INTERNAL_AGENT, EXTERNAL_INTEGRATION) |
| `entityType.js` | Entity Type model with schema/field definitions |
| `coreEntityTypes.js` | 8 platform Core Entity Types |
| `entity.js` | Entity instance model |
| `relationship.js` | Workspace-scoped relationship model |
| `record.js` | Canonical Record foundation |
| `file.js` | File/attachment metadata |
| `entityService.js` | Entity CRUD, validation, reference resolution |
| `entityTypeService.js` | Entity Type registry, seeding, management |
| `relationshipService.js` | Relationship creation with integrity |
| `recordService.js` | Record lifecycle, entity reference validation |
| `fileService.js` | File metadata registration |
| `fileStorageContract.js` | Provider-independent file storage interface |

Key concepts:
- **Entity != Record != Module**. Entities are persistent identities; Records are business events.
- **Entity Types** have two categories: CORE (platform) and DOMAIN (organization).
- **Core Entity Types** are seeded idempotently per workspace and protected from modification.
- **Domain Entity Types** are user-extensible with typed field schemas.
- **Relationships** are workspace-scoped, validated (no dangling references, no cross-workspace).
- **Records** support distinct actor roles (createdBy, submittedBy, future: assignedTo, etc.).
- **Files** store metadata in Firestore; binary data goes to Firebase Storage.
- **Reference Resolver** enforces workspace isolation — cross-workspace references denied.
- All data is under `workspaces/{workspaceId}/` subcollections with explicit Firestore Security Rules.
- See `docs/UNIVERSAL_DATA_CORE.md` for full architecture.

## Step 3.1 — Universal Data Integrity Hardening

Step 3.1 hardened validation, reference integrity, and actor security without changing product scope:

### Validation
- `validateEntityData()` now validates actual field types (text/number/date/boolean/select/entity-reference/file-reference).
- `validateFieldDefinition()` validates key format, type support, constraints consistency, select options.
- `validateFieldDefinitions()` rejects duplicate field keys across an Entity Type.
- `validateFieldValue()` provides per-field type-specific validation.
- Undeclared fields in Entity data are **rejected** (schema-governed unknown-field policy).
- Canonical date representation: ISO 8601 (YYYY-MM-DD or full datetime).

### Reference Integrity
- `validateEntityReference()` — canonical structural validator shared across services.
- Entity Reference resolution verifies `ref.entityTypeId == entity.entityTypeId` (type integrity).
- Record `entityReferences[]` stores canonical objects (source of truth).
- Record `entityReferenceIds[]` is a derived flat array for `array-contains` queries (index only).
- Entity creation requires Entity Type with `ACTIVE` status.

### Actor Security
- Firestore Rules enforce `createdBy.actorType == 'USER'` and `actorId == auth.uid` via `isValidClientActor()`.
- `INTERNAL_AGENT` and `EXTERNAL_INTEGRATION` rejected from all client writes.
- Actor fields immutable after creation.

### Revalidation
- Entity updates revalidate data against Entity Type schema.
- Record draft updates revalidate entityReferences, data, and attachments.

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

### Adding New Workspace-Scoped Collections

**NO NEW WORKSPACE-SCOPED FIRESTORE COLLECTION MAY BE ADDED WITHOUT EXPLICIT SECURITY RULES AND CROSS-WORKSPACE NEGATIVE TESTS.**

1. Place as subcollection under `workspaces/{workspaceId}/` or `organizations/{orgId}/`
2. Add read rules requiring workspace ownership or `isActiveMember(orgId)`
3. Add appropriate write rules with immutable field protection
4. Add cross-workspace and cross-org negative tests in `tests/rules/`
5. Document in `docs/SECURITY_MODEL.md`

## Migration Note

This is a clean rebuild. Modulity V1 is only a reference and must not be copied.
