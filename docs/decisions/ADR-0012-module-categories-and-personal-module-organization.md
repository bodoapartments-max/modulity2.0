# ADR-0012 — Module Categories, Personal Module Organization & Technical Identifier Generation

## Status

Accepted — Step 17.2 (implemented, verified on `modulity-2-dev`).

## Context

Workspaces will host tens/hundreds of Modules. The flat Module experience does
not scale. V1 mixed three concerns (category = localStorage visibility map,
hardcoded category ids, per-module duplication) that must never merge.

We needed:

1. canonical Module categorization, shared by manual and Automat-generated Modules
2. personal Module selection and ordering (user preference, never authorization)
3. grouped/flat presentation
4. automatic technical code generation so users stop inventing codes
5. stable codes that renames/translations never touch

## Decision

### One canonical category model

New collection `workspaces/{ws}/moduleCategories/{categoryId}`:

| Field | Rule |
|---|---|
| `categoryId` | internal stable id (`cat_*`), immutable |
| `workspaceId` | workspace scope, immutable, rules-enforced |
| `displayName` | human label — renamable freely |
| `categoryCode` | UPPER_SNAKE technical code, generated from displayName at creation, immutable afterwards |
| `description`, `sortOrder`, `status` | ACTIVE | ARCHIVED — archive keeps Module links |

Modules get `categoryId` (canonical link); legacy free-text `category` stays
as a historical snapshot only. Automat applies normalize their area text
(FRONT_OFFICE, RESTAURANT, INVENTORY…) into this SAME collection via
`ensureModuleCategoryResource` — one taxonomy, no AI parallel.

### Three separate concepts — never merged

| Concept | Meaning | Storage |
|---|---|---|
| MODULE CATEGORY | organizational bucket | `moduleCategories` + `Module.categoryId` |
| MODULE ACCESS | authorization | Firestore Rules + membership (server) |
| PERSONAL VISIBILITY/ORDER | I see what I'm authorized for, reduced | `userWorkspacePreferences/{uid}.moduleSelection` |

A hidden-but-authorized Module stays discoverable in All Modules. A preference
can never grant access (service filters against the workspace's real Module
list on write).

### Uncategorized is a derived bucket, never stored

Missing categoryId → bucket `UNCATEGORIZED` (display "Uncategorized").
Legacy free-text category text gets its own derived bucket (`LEGACY::<NAME>`)
so old data stays readable without pretending to be canonical.

### Automatic technical identifiers

`src/core/utils/technicalCode.js`:
- `generateTechnicalCode(label)` — deterministic UPPER_SNAKE from the display
  label (diacritics stripped, letter-leading enforced).
- `resolveCodeCollision(base, existing)` — deterministic `_2`, `_3`… suffixes.
- Module Service: `createModule` accepts `moduleCode = null` → derived from
  `name` + collision-safe against `moduleCodes/` reservations.
- Designer: Code field optional, placeholder "Auto-generated from Name";
  explicitly-typed code still allowed and immutable after creation.

Stable codes never follow display renames (Rule 6).

## Consequences

- Manual, Automat, and future Admin categories converge on one collection.
- Personal preference model is portable across clients (Web now, Mobile/
  WordPress/API later) — pure data, no presentation state leaks into Records.
- Category changes never touch Records, Ledger, ModuleVersion history or
  technical codes.
- No new composite indexes required (category list bounded at 200; module
  listing bounded at 500). Preference reads use the existing doc-get pattern.
- Rules enforce: workspace isolation, category code stability, actor binding,
  per-user preference ownership (cannot read/write another user's prefs).

## Security notes

- All new write surfaces covered by negative emulator tests (cross-workspace
  category write, actor spoof, code mutation, preference cross-user).
- Personal preferences can only reference Modules that exist in the workspace;
  this is hygiene, NOT an authorization decision — Rules remain the authority.

## Future (not in this step)

- Trusted Entity & Module Administration + Change History (full trusted CRUD)
- CONTACT Core Entity Type
- Richer per-user permission administration for Module visibility
- Platform UX Hardening for other technical-identifier surfaces
