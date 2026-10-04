# Trusted Administration Architecture (Step 17.3)

**Goal:** Entity Type / Entity / Module / Module Category administration is
server-authoritative, with durable before/after Audit and dependency-gated
hard delete.

## Authority matrix

| Resource | Browser | Trusted boundary |
|---|---|---|
| Entity Type (DOMAIN) | Read only | adminCommand |
| Entity Type (CORE seed) | Bootstrap seed | read-only at runtime |
| Entity | Read only | adminCommand |
| Module | Read only (designer) | adminCommand |
| Module Category | Read only | adminCommand |
| Audit entries | Read only (scoped) | written by trusted engines |

## Components

- **Contract** — `src/core/admin/adminCommandContract.js` — versioned,
  typed, forbid forgeable keys, `contractVersion: 1.0.0`.
- **Engine** — `functions/src/adminCommandEngine.js` — authentication →
  workspace authorization (USE vs ADMINISTER) → validation → dependency
  analysis → single-transaction mutation + audit + journal.
- **Dependency analyzer** — `src/core/admin/adminDependencyAnalyzer.js` —
  closed registry of typed dependency kinds; bounded `limit(1)` existence
  probes only. No arbitrary collection paths.
- **Client adapter** — `src/infrastructure/firebase/adminCommandClient.js`
  — callable wrapper used by the shared core services, which switch between
  repo-direct writes (legacy) and trusted calls transparently.
- **UI** — `AdminActions` shared strip (Rename/Archive/Restore/Delete with
  dependency explanation), `AdminHistoryPage` (bounded audit view),
  `ModuleCategoriesPage` (canonical taxonomy admin).

## Identity discipline

- `typeId`/`entityId`/`moduleId`/`categoryId` — server-generated, immutable.
- `code`/`categoryCode`/`moduleCode`/`entityCode` — technical identifiers,
  generated via `technicalCode.js` with collision suffixes, immutable after
  creation.
- `displayName`/`name` — renamable freely; never touches identity.

## Dependency-gated hard Delete

```
DELETE_MODULE → MODULE_HAS_RECORDS? MODULE_HAS_VERSIONS? MODULE_USED_BY_LEDGER_BOOK?
              → MODULE_IN_WORKSET? MODULE_IN_WIDGET? MODULE_IN_REPORT?
DELETE_ENTITY → ENTITY_REFERENCED_BY_RECORDS? ENTITY_IN_RELATIONSHIPS?
DELETE_ENTITY_TYPE → ENTITY_TYPE_HAS_ENTITIES? ENTITY_TYPE_USED_BY_MODULE_SCHEMA? PRIMARY_OF_MODULE?
DELETE_MODULE_CATEGORY → CATEGORY_USED_BY_MODULES?
```

Zero-blocker deletes are permanent; blocked deletes return
`DEPENDENCY_BLOCKED { dependencies: [{ kind, label, count }] }`, and the UI
recommends Archive instead.

## CONTACT

`core:contact` is a seeded Core Entity Type with `name`, `companyName`,
`role`, `email`, `phone`, `notes` fields. It IS NOT a User/Membership.
Creating a Contact creates no auth principal, ever.

## Reset

The reset contract already removes the protected resources because
`entityTypes` (DOMAIN_ONLY), `entities`, `modules`, `moduleCodes`,
`moduleCategories`, `recordOperations`, `auditEntries` all live under
`workspaces/{ws}`. Existing CORE definitions stay intact, keyed by
stable `core:*` ids.

## Performance

- Dependency probes are existence-only (`limit(1)`) and run pre-transaction.
- Admin History reads one bounded page (default 100) from `auditEntries`.
- No new composite indexes were required.

## Portability

adminCommand is a pure callable — it works from Web, future Mobile, future
WordPress, future External API. The React UI is a client, never the boundary.
