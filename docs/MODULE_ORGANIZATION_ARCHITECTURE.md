# Module Organization Architecture (Step 17.2)

This document describes the canonical model for Module categorization,
personal Module selection, and technical identifier generation.

## Three concepts — never merged

```
MODULE CATEGORY          ≠ authorization        ≠ personal visibility
"what area is this"      "am I allowed"          "do I want it prominent"
moduleCategories         Firestore Rules +       userWorkspacePreferences
+ Module.categoryId      membership              .moduleSelection
```

| Layer | Canonical model | Decision maker |
|---|---|---|
| Category | `workspaces/{ws}/moduleCategories/{id}` | workspace (user or Automat) |
| Authorization | Rules + membership (untouched by this step) | server |
| Personal selection | `workspaces/{ws}/userWorkspacePreferences/{uid}.moduleSelection` | the user (self) |
| Presentation | react states + same preference doc (`viewMode`) | the user |

## Canonical models

### ModuleCategory

`src/core/workspace/moduleCategory.js`

```text
categoryId   — stable id (cat_*), immutable
workspaceId  — immutable
displayName  — renamable human label
categoryCode — UPPER_SNAKE, generated, COLLISION-SAFE, IMMUTABLE
description
status       — ACTIVE | ARCHIVED
sortOrder
```

Archive keeps Module links valid; archived categories show their Modules under
a marked bucket at read time (`resolveModuleCategoryBucket`).

### Module.categoryId

Canonical organizational link. Legacy free-text `category` string stays as a
historical snapshot. Buckets are derived at read time:

- canonical categoryId found + ACTIVE → its displayName
- categoryId found + ARCHIVED → "X (archived)" under UNCATEGORIZED
- no categoryId + legacy text → `LEGACY::<TEXT>` derived bucket
- nothing → `UNCATEGORIZED`

NO CATEGORY NEVER MEANS NOT DISCOVERABLE.

### Personal Module preference

`moduleSelection` on the existing `userWorkspacePreferences/{uid}` doc:

```text
selectedModuleIds  — moduleIds the user wants prominent (validated server-side
                     against the workspace's real Module list on write)
moduleOrder        — personal ordering over those ids
viewMode           — FLAT | GROUPED
collapsedCategoryIds — UI collapse state
```

Invariants enforced in `createWorkspacePreferenceService`:

- preferences only reference REAL Modules (`moduleRepo.listByWorkspace` check)
- they never copy Module data
- they are workspace-scoped (no cross-workspace leaks)
- they are user-scoped (Firestore Rules deny cross-user access)

## Manual vs Automat

Manual Modules use the same `moduleCategories` collection via the Designer's
category selector (with inline "+ New Category"). Automat applies normalize
proposals' `category` text into same-collection categories via
`ensureModuleCategoryResource` in functions. Both paths share
`generateTechnicalCode` for canonical codes.

## My Modules vs All Modules

- **My Modules** (`/app/modules`): personalized view — search, category filter,
  grouped/flat toggle, Customize panel (checkbox selection + ordering).
  Hidden-but-authorized Modules are still authorized.
- **All Modules** (header `AllModulesNavigator`): the full authorized
  discovery surface, grouped by canonical category. Deliberately ignores the
  personal selection — hiding a module from My Modules must never remove it
  from this dropdown.

## Technical identifier generation

`src/core/utils/technicalCode.js`:

- `generateTechnicalCode(label)` — deterministic UPPER_SNAKE
- `resolveCodeCollision(base, existing)` — `_2`, `_3` suffixes
- Designer: Code optional; empty → auto-generated from Name
- Module Service: `createModule({ moduleCode: null })` → derived + deduplicated
- Renames never change codes (prepares for localization)

## Performance

- Categories bounded at 200/workspace
- Modules bounded at 500 for preference decisions
- No per-module listeners, no N+1 category fetches
- No new Firestore composite indexes needed

## Reset

`moduleCategories` and `userWorkspacePreferences` are already reset-scoped —
no ghost data after Workspace Reset (tested by E2E `step17_2` and kept green
in the rules/emulator suites).

## Security (Rules)

| Collection | Read | Create | Update | Delete |
|---|---|---|---|---|
| moduleCategories | workspace-scoped | owner-scoped actor, workspace match, bounded code length, valid status | code/identity/workspace immutable | ❌ |
| userWorkspacePreferences | owner only | owner only | owner only | ❌ |

Negative emulator tests cover cross-workspace category writes, actor spoofing,
code stability, and cross-user preference isolation.

## V1 → V2 migration matrix

| Concept | V1 (legacy) | V2 | Decision |
|---|---|---|---|
| Hardcoded category buckets | `modulesData` array | canonical moduleCategories | REPLACE |
| localStorage visibility map | `module-visibility-v1` | userWorkspacePreferences.moduleSelection | REPLACE (server-canonical) |
| Per-Module JSX copies | `custom-modules-v1` localStorage | one canonical Module definition | DO NOT COPY |
| Module discovery dropdown | workset filter ("All Modules") | AllModulesNavigator (grouped) | KEEP + MODERNIZE |
| Module favorites | `moduleFavorites` localStorage | covered by personal selection | REPLACE |
