# ADR-0004 — Loosely Coupled Composable Capability Engines

## Status

Accepted.

## Context

Calendar, Workflow, Approval, Notification, Task, Scheduling, Inventory, Document, Integration, and future platform behavior must compose around canonical Entities, Modules, and Records without creating duplicate business-data systems or embedding optional engine ownership inside ModuleDefinition.

## Constraints

- Entity, Module, Record, Ledger, and Audit remain canonical.
- Step 9.2 is the only trusted Automat configuration-write boundary.
- Optional engines must not invalidate canonical data when absent or failing.
- Definitions cannot carry executable code, arbitrary Firestore paths, authority, entitlement, or credentials.
- Calendar and action-engine runtimes are out of scope for Step 10.2.

## Options considered

1. Embed engine configuration inside every Module. This creates lifecycle coupling and makes Modules dependent on optional engines.
2. Create engine-specific business records/stores. This duplicates canonical data and creates synchronization conflicts.
3. Use independent versioned CapabilityDefinitions referencing typed canonical sources. This preserves loose coupling and composition.

## Decision

Adopt option 3.

A trusted built-in `CapabilityEngineRegistry` contains versioned descriptors and deterministic validator seams. Independent versioned CapabilityDefinitions reference explicit Workspace-scoped canonical sources. CapabilityBindings associate Definitions with sources without owning data. Views remain derived projections.

Engine availability is explicit and separate from entitlement. Step 10.2 built-ins are `ARCHITECTURE_ONLY`. A CalendarDefinitionV1 validator proves field/source mapping, but no Calendar runtime or persistence exists.

CapabilityDefinition persistence is deferred until the first real Engine has an operational consumer and trusted lifecycle requirements. Workspace Architect receives only a code-free catalog and may emit non-operational requirements; existing BuildPlan apply writes no capability resources.

## Consequences

- Modules remain valid without optional Engines.
- One Module can compose Calendar, Approval, Notification, and other capabilities.
- Canonical data remains singular and capability projections remain rebuildable.
- Future action engines require trusted authorization, command, idempotency, journal, and Audit boundaries.
- External extensions must use versioned APIs/events/commands rather than arbitrary in-process JavaScript.
- Contract/Definition version migration remains future work.

## Security consequences

Cross-Workspace sources, arbitrary paths/queries, scripts, expressions, remote module URLs, `eval`, and functions are rejected. Definitions provide configuration, never authority.

## Deferred

Calendar runtime/UI, Workflow/Approval/Inventory/Task/Scheduling runtimes, Notification redesign, plugins, persistence, migrations, billing, and background execution.
