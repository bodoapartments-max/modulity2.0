# Composable Capability Engine Architecture

## Status

Step 10.2 architecture foundation. This document defines contracts and invariants; it does not claim that Calendar, Workflow, Approval, Scheduling, Inventory, Task, Integration, Document, or generic Notification Engines are operational.

## Existing architecture audit

| Area | Status | Capability role |
|---|---|---|
| Identity, Workspace, Membership, Permissions | EXISTING | Core platform trust and scope boundary |
| Entity Type / Entity | EXISTING | Canonical persistent business-object model |
| Module / Form Schema / Field Registry | EXISTING | Canonical process definition and declarative capture schema |
| Record / query / collaboration | EXISTING | Canonical business occurrence and bounded query services |
| Ledger / Audit | EXISTING | Canonical registration and accountability |
| Reports / Analytics | EXISTING | Read/projection behavior over canonical data; an existing capability-like subsystem |
| Widgets | EXISTING | Declarative bounded projections over canonical data |
| Worksets | EXISTING | Context/presentation grouping, not authorization |
| Notifications | PARTIAL | Canonical notification data and delivery UI exist; no generic policy/dispatch CapabilityDefinition engine |
| Event Bus | PARTIAL | In-process event coordination exists; it is not durable workflow/integration execution |
| Agent Registry / provider adapters | EXISTING | Optional planning intelligence boundary, not capability execution |
| Workspace Architect / BuildPlan | EXISTING | Can consume safe catalog metadata and recommend architecture-only requirements |
| Generic Capability contracts/Registry | ADDED IN STEP 10.2 | Versioned extension architecture and validation seam |
| Calendar Definition contract | ADDED IN STEP 10.2 | Contract proof only; no runtime, query, event store, or UI |
| Workflow, Approval, Task, Scheduling, Inventory runtime | DEFERRED | Future trusted capability milestones |
| External plugin installation/marketplace | DEFERRED | Future versioned API/event/command boundary only |
| CapabilityDefinition persistence/migrations | DEFERRED | Add with the first real engine, not before a consumer exists |

## Terminology

### Core platform / Core engines

Fundamental canonical behavior: Identity, Workspace, Authorization, Entity, Module, Record, Ledger, and Audit. Existing service/domain naming remains authoritative; “engine” describes architectural role, not filename conventions.

### Capability Engine

A reusable platform behavior that operates around canonical Entity Types, Entities, Modules, Records, Worksets, or approved query definitions. It is not an Entity Type, Module, Record, page, AI agent, or entitlement.

### Capability Definition

Versioned declarative configuration selecting canonical sources and mapping schema fields into engine semantics. It contains no executable code and grants no authority.

### Capability Binding

A small association among an engine contract, a Definition reference, and a canonical source reference. Bindings do not own source data.

### Capability View

A user-facing projection powered by an Engine. A View is not a canonical business store.

## Canonical invariant

```text
Entity Type → Entity
Module → Record
              │
              ├── Capability Definition
              ├── Capability Engine
              └── derived View or trusted action
```

There remains one canonical Entity system, Module system, and Record system. Engines must not create `CalendarReservation`, `WorkflowReservation`, or similar duplicate business records.

## Contract layer

Step 10.2 adds:

- `CapabilityEngineDescriptor@1.0.0`
- deterministic `CapabilityEngineRegistry`
- `CapabilitySourceRef`
- `CapabilityDefinition@1.0.0`
- `CapabilityBinding@1.0.0`
- availability and read/action classifications
- bounded executable-free configuration validation
- trusted engine-specific validator registration seam
- `CalendarDefinitionV1` contract proof
- code-free Workspace Architect capability catalog

Stable engine identifiers are lowercase machine identities such as `calendar`, `workflow`, and `approval`. Display names are not identity.

## Availability

- `ARCHITECTURE_ONLY`: contract/validator may exist, but no operational runtime exists.
- `AVAILABLE`: end-to-end runtime exists and can be enabled subject to authorization and entitlement.
- `DISABLED`: implementation exists but is administratively unavailable.
- `UNAVAILABLE`: unsupported in this deployment.

Availability is technical state, not commercial entitlement. Step 10.2 built-ins are `ARCHITECTURE_ONLY`; Automat must never describe them as operational.

## Loose coupling decision

Capability Definitions reference Modules, Entity Types, or Worksets using typed canonical refs such as:

```json
{
  "kind": "MODULE",
  "ref": "module:RESERVATION",
  "workspaceId": "workspace-id"
}
```

Definitions are not embedded wholesale inside ModuleDefinition. Modules remain valid when optional Engines are absent, one source can compose multiple capabilities, and capability lifecycle/versioning can evolve independently.

Arbitrary Firestore paths, raw queries, remote module URLs, expressions, scripts, JSX, `eval`, and functions are forbidden.

## Validation boundary

Generic validation requires:

1. registered engine and supported contract version;
2. valid availability and definition lifecycle;
3. explicit Workspace scope;
4. supported typed source kind;
5. canonical source resolver;
6. source existence, kind, and Workspace ownership;
7. bounded safe configuration;
8. trusted engine-specific validation.

Definition configuration is never authorization. Execution must separately enforce authenticated identity, Workspace access, permission, entitlement, canonical service rules, and audit.

## Calendar contract proof

`CalendarDefinitionV1` maps one Module schema:

```json
{
  "engineId": "calendar",
  "contractVersion": "1.0.0",
  "source": { "kind": "MODULE", "ref": "module:RESERVATION" },
  "configuration": {
    "definitionType": "CalendarDefinitionV1",
    "mapping": {
      "titleField": "guestName",
      "startField": "arrivalDate",
      "endField": "departureDate",
      "resourceField": "room"
    }
  }
}
```

The validator checks field existence and semantic field types. `startField`/`endField` must be date/datetime; `resourceField` must be EntityReference. Reservation, Holiday Request, and Meeting fixtures pass.

There is no Calendar runtime, query service, event persistence, UI, drag/drop, or navigation in Step 10.2.

Future intended flow:

```text
canonical Record query
→ CalendarDefinition
→ Calendar Engine
→ rebuildable Calendar Event projection
→ Calendar View
→ canonical Record Detail
```

## Read vs action capabilities

Read/projection capabilities derive rebuildable state and views. Calendar, Timeline, Map, analytics, and future Inventory projection fit this class.

Action/process capabilities may transition state, dispatch notifications, create tasks, or call integrations. They require trusted command services, authorization, idempotency, journals, failure handling, and Audit. Browser/AI configuration can never be execution authority.

## Composition and dependencies

One source may have multiple independent Definitions:

```text
Holiday Request Module
├── Approval
├── Calendar
└── Notification
```

Descriptors may declare `requires` and `optionalDependencies`. The Registry rejects known dependency cycles. Step 10.2 does not implement runtime dependency resolution.

## Derived state

Capability outputs should be derived and rebuildable:

- Reservation Records → Calendar projection
- Stock movement Records → stock projection
- canonical events/state → notification/workflow projections

Materialized projections may be introduced for performance only with explicit source-of-truth, rebuild, consistency, and failure policies.

## Future action flows

### Approval

```text
Holiday Request Record
→ ApprovalDefinition
→ trusted Approval Engine action
→ canonical Record state/history
→ Audit
```

### Inventory

```text
Goods Receipt / Issue / Transfer / Adjustment Records
→ InventoryDefinition
→ Inventory Engine
→ derived current stock
→ View / Widget / Report
```

### Workflow

```text
canonical event/Record
→ WorkflowDefinition
→ trusted Workflow Engine
→ authorized idempotent command
→ canonical state
→ Audit / Notification
```

These are documentation only in Step 10.2.

## Security and multi-Workspace invariants

- Every Definition and source is explicitly Workspace-scoped.
- Resolution rejects cross-Workspace sources.
- Definitions cannot grant roles, permissions, entitlement, database access, or credentials.
- No Engine receives arbitrary Firestore access from configuration.
- No uploaded JavaScript, remote script, `eval`, or `Function` execution.
- Personal and Organization Workspaces use the same contracts; existing authorization remains authoritative.
- Queries must be bounded, paginated, server-filtered, and stably ordered.
- Optional capability failure must not corrupt canonical data.

## Observability invariant for future action engines

Future action execution must carry correlation ID, engine/version, definition/version, Workspace, actor/system actor, result, timestamps, and Audit/journal references. Step 10.2 creates no telemetry infrastructure.

## Automat integration

WorkspaceSemanticModel includes a code-free deterministic catalog containing descriptor metadata only. Architect plans may emit non-operational `capabilityRequirements` with actual availability. Step 9.2 apply ignores these planning recommendations and writes no CapabilityDefinitions.

## Persistence decision

CapabilityDefinitions are not persisted in Step 10.2. There is no consumer/runtime requiring canonical Definition lifecycle yet. No Firestore collection, Rules, index, reset path, cache, or second source of truth is added. Persistence, migration, and trusted management are deferred to the first real Capability Engine milestone.

## Failure isolation

A Calendar projection failure cannot invalidate a Reservation Record. A future notification/provider failure cannot invalidate canonical Record state. Action engines must journal external/partial failures and avoid corrupting canonical data.

## Verification

Contract tests pass for Registry/version/availability/dependencies, safe sources, Workspace isolation, executable-configuration rejection, Calendar Reservation/Holiday/Meeting mappings, composition, stable catalog ordering, and Architect integration. Full unit, build, Rules/Emulator, trusted apply, Workspace Reset, Step 10.0 Entity Management, and Step 10.1 evolution regressions pass. Authenticated Reset Test Hotel review shows Calendar as `ARCHITECTURE_ONLY`, non-operational and non-applied; existing Employee, Room, Reservation, and restaurant reuse behavior remains healthy.

## Deferred scope

Calendar runtime/UI/querying/event persistence, Workflow, Approval, Inventory, Task, Scheduling, Notification redesign, external plugins, marketplace, background framework, billing, Definition migrations, RelationshipDefinition, and destructive migration remain deferred.
