# Modulity 2.0 — Migration from Modulity V1

This document defines the philosophy for migrating from Modulity V1, if it ever happens.

---

## 1. Clean Rebuild

Modulity 2.0 is a clean rebuild.

- Do not copy Modulity V1 source files into this repository.
- Do not import V1 architecture by default.
- Do not recreate old architecture just because it existed.

## 2. Reference, Not Import

The Modulity V1 repository may be consulted only when explicitly requested.

Allowed uses:

- Understanding domain concepts
- Reviewing user-facing terminology
- Identifying pain points to avoid

Not allowed:

- Copying code
- Copying schema
- Copying UI components
- Copying configuration

## 3. Migration is a Future Milestone

A formal migration from V1 data/users to V2 is not part of Step 0 and not implemented now.

When it is planned:

1. Define a migration scope and mapping document.
2. Create an isolated migration subsystem (e.g. `migrations/v1-to-v2/`).
3. Validate all data against V2 schemas.
4. Map V1 entities to V2 Core/Domain Entity model.
5. Map V1 records to V2 canonical Record model.
6. Preserve immutable V1 IDs where possible.
7. Run migration in a test environment before production.
8. Produce an audit report of migrated data.

## 4. Data Ownership

- V2 is the owner of all V2 data.
- A migration may produce a read-only snapshot of V1 data if needed.
- Users must explicitly trigger and approve migration.

## 5. No V1 Runtime in V2

The V2 runtime must not depend on V1 code, libraries or services at runtime. Any V1 compatibility layer is temporary and explicitly scoped.
