# ADR-0013 — Trusted Entity & Module Administration + Change History

## Status

Accepted — Step 17.3 (implemented, verified on `modulity-2-dev`).

## Context

Step 17.2 left protected administration partially client-authoritative:
Entity Types, Entities, Modules and Module Categories could be written by the
browser directly. The audits in §2 of the step request found:

- Entity Type/Entity write paths were direct Firestore writes from the UI
- Module creation/updates bypassed any trusted boundary
- No durable before/after Audit for administrative actions
- No dependency-gated hard Delete

That broke the platform principle that only trusted servers author
authoritative state.

## Decision

### One generic trusted admin engine, typed subcommands

A new callable `adminCommand` (europe-west1) with a versioned contract
(`src/core/admin/adminCommandContract.js`) handles:

- `CREATE/UPDATE/ARCHIVE/RESTORE/DELETE_ENTITY_TYPE`
- `CREATE/UPDATE/ARCHIVE/RESTORE/DELETE_ENTITY`
- `CREATE/UPDATE_METADATA/ARCHIVE/RESTORE/DELETE_MODULE`
- `CREATE/UPDATE/ARCHIVE/RESTORE/DELETE_MODULE_CATEGORY`

One engine, one operation journal, one dependency analyzer, one audit-write
path. We chose this over per-resource commands because everything shares the
same guarantee surface, so the shared engine is strictly smaller.

### Client convergence without UI churn

Core services (`entityService`, `entityTypeService`, `moduleService`,
`moduleCategoryService`) accept an optional `adminCommand` executor. When
present, mutations route through the callable; read paths stay on Firestore
repositories. Existing UI entry points needed zero redesign — they already
flow through services.

### Authority levels

`COMMAND_AUTHORITY` distinguishes `USER` (entity day-to-day ops usable by
active members) from `ADMIN` (everything else — OWNER/ADMIN in orgs, owner in
personal workspaces). USE ≠ ADMINISTER.

### Dependency analyzer

A closed, typed registry (`adminDependencyAnalyzer.js`) of dependency Kinds
with bounded existence checks (aggregation/limit(1), no arbitrary queries).
Hard Delete is denied when any Kind finds a reference. Audit evidence is never
a blocker; delete writes a `*.deleted` Audit row so administrative history
outlives the deleted document itself.

### Before/after Audit

Every trusted mutation writes `auditEntries/op_{opId}_{action}` in the same
transaction as the mutation, carrying `metadata.change = { before, after }`
with bounded key sets — no full-document snapshots. Actors and timestamps are
always server-derived; `adminCommand` reject envelope keys crafted by clients.

### CONTACT

CONTACT is a new canonical Core Entity Type (`core:contact`, field template
name/company/role/email/phone/notes), seeded like all other core types. It is
a business person reference, not an authentication principal — there is no
link to User/Membership and the rules/tests assert that.

### Migration (§41)

Legacy objects keep working — reads unchanged, no required recreation.
Pre-17.3 administrative history doesn't exist and is NOT fabricated: History
shows trusted entries starting at 17.3. browser writes that would have been
"client housekeeping" before are now denied and produce no synthetic history.

## Trust boundary (post-Step 17.3 rules)

| Collection | Browser write |
|---|---|
| entityTypes | CORE seed only (browser bootstrap); DOMAIN write denied |
| entities | denied |
| modules | create denied |
| moduleCategories | denied |
| recordOperations | already server-only (Steps 15-17.1) |
| ledgerEntries/books | already server-only (Steps 16+17.1) |
| auditEntries | already server-only (Step 16) |
| notifications | read-state only (Step 17) |

## Consequences

- Humans typo-safe: rename is one click, identity/code preserved.
- History is durable even after a hard Delete of an unused object.
- Agent/Automat compatibility: same engine is invocable with `internal: true`
  so future Automat-led administration converges on the exact same mutation
  path (human and AI never diverge).
- Reset now clears entityTypes/entities/modules/moduleCategories,
  recordOperations, auditEntries, userWorkspacePreferences, etc. — regression
  covered by the existing reset suites plus the live E2E.

## Alternatives considered

- **Four per-resource command engines**: rejected — would duplicate journal /
  authorization / audit logic 4×.
- **GraphQL-style generic resolver**: rejected — the closed, typed registry
  prevents arbitrary-query creeping in via the admin surface.
- **Browser-side authorship with stronger Rules** (Step 17.2 pattern):
  rejected for administration — Rules cannot express dependency analysis or
  durable before/after Audit in a transactional mutation.
