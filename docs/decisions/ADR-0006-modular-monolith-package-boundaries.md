# ADR-0006 — Modular Monolith Package Boundaries

## Status

Accepted — Step 11.0 planning decision. Physical migration deferred to Step 11.1.

## Context

Modulity 2.0 has grown from a single Vite + React application into a platform with:

- Core domain (Entity, Module, Record, Ledger, Audit)
- Generic capability infrastructure (Capability Engine registry, definitions, bindings)
- The first operational Capability Engine (Calendar)
- Agent infrastructure and concrete agents
- A growing surface of user-facing Features
- Infrastructure adapters (Firebase Auth, Firestore, Storage, Functions)
- A design system

The existing `src/core/capabilities/` directory mixes generic capability contracts with Calendar-specific engine code. The `src/infrastructure/` directory contains both platform adapters and a dev-only entitlement resolver that imports Agent code, violating the documented inward dependency direction. The design system is missing several reusable primitives that are duplicated across features. The AppShell route table has become a monolith.

Before adding more Capability Engines (Approval, Workflow, Task, Scheduling, Inventory, Document, etc.), we need clean package boundaries that make it obvious where each new engine belongs and prevent Core from accumulating optional engine code.

## Decision

Adopt an explicit package-boundary convention inside a single Git repository (modular monolith).

### Package hierarchy

```text
app/
features/
engines/
agents/
capabilities/
core/
infrastructure/
design-system/
shared/
```

### Rules

1. `core/` contains canonical business logic only. No React, no Firebase, no optional engines, no feature UI.
2. `capabilities/` contains generic capability infrastructure: contracts, registry, definition lifecycle, validation orchestration. It does not contain engine-specific runtimes.
3. `engines/<name>/` contains a single Capability Engine's domain model, runtime, validation, and tests. Engines depend on `capabilities/`, `core/`, and `shared/`.
4. `agents/` contains generic agent infrastructure and concrete agents. Agents depend on `core/` and `shared/`; they never import infrastructure or features.
5. `features/` contains user-facing React pages, hooks, and model files. Features depend on engines, capabilities, core, shared, and design-system.
6. `infrastructure/` contains platform-specific adapter implementations and service wiring. It implements ports defined by `core/` and consumed by `features/`. It must not import agents or features.
7. `design-system/` contains reusable visual primitives. No business logic.
8. `shared/` contains domain-neutral contracts and utilities used by multiple layers (e.g., repository interfaces, presentation helpers, storage contracts).
9. `app/` is the composition root: providers, routing, shell. It may import any layer.

### Concrete moves

- Move Calendar engine/runtime/validation code from `src/core/capabilities/` to `src/engines/calendar/`.
- Move generic capability infrastructure from `src/core/capabilities/` to `src/capabilities/`.
- Move `src/infrastructure/automatPlanning.js` to `src/agents/infrastructure/`.
- Move presentation helpers out of `src/core/data/` into `src/shared/` or the form layer.
- Split `src/app/shell/AppShell.jsx` route table into per-feature route modules.
- Add a registered engine-factory seam so adding a new engine does not require editing generic capability core files.

## Consequences

- Future engines have a clear, consistent location.
- Core remains focused on canonical domain logic.
- The dependency graph becomes visually enforceable.
- `functions/scripts/build-shared.mjs` must be updated if moved files are on the copy list.
- Tests must be co-located with moved files.

## Deferred

- Splitting the repository into multiple packages/workspaces.
- Extracting `engines/` or `agents/` into independently deployable units.
- Adding npm workspaces or a shared package for Cloud Functions until the copy mechanism becomes a bottleneck.

## Related

- `docs/ARCHITECTURE.md`
- `docs/PACKAGE_ARCHITECTURE.md`
- `docs/MODULITY_MASTER_ROADMAP.md`
- ADR-0004 (Composable Capability Engines)
- ADR-0005 (CapabilityDefinition Persistence and Calendar)
