# Calendar Engine — Step 10.4

## Overview

The Calendar is the first operational Capability Engine in Modulity 2.0. It remains a **derived read/projection capability**; it does not own canonical business data.

```text
Canonical Records
      ↓
CalendarDefinition (CapabilityDefinition)
      ↓
Calendar Engine
      ↓
CalendarEventProjection
      ↓
Calendar View (Month / Week / Day)
      ↓
Record Detail
```

## Core invariants

- A Reservation, Holiday, Meeting, or Maintenance Record is **one** canonical Record.
- The Calendar never creates `calendarEvents`, `reservationEvents`, `holidayEvents`, or any parallel business-data collection.
- Projections are rebuildable from canonical Records + `CalendarDefinition`.
- Calendar authorization relies on existing Workspace, Module, and Record authorization.
- CapabilityDefinitions cannot grant authority, permissions, or entitlement.

## Definition model

A `CalendarDefinition` is a persisted generic `CapabilityDefinition`:

- `engineId`: `calendar`
- `contractVersion`: `1.0.0`
- `source`: typed canonical reference (`module:...`, `entityType:...`, `workset:...`)
- `configuration.mapping`:
  - `titleField` — human-readable text/select/email/phone/entity-reference field
  - `startField` — required date/datetime field
  - `endField` — optional date/datetime field
  - `resourceField` — optional entity-reference field
- Lifecycle: `DRAFT` → `ACTIVE` → `INACTIVE` / `ARCHIVED`

Field choices are constrained by the source Module's `FormSchema` metadata.

## Projection model

`CalendarEventProjection` is an in-memory read model containing:

- `recordId`, `moduleId`, `moduleVersion`, `definitionId`
- `title`
- `start`, `end`
- `allDay` (derived from date-only fields)
- `resourceRef`, `resourceLabel` (resolved through canonical Entity service)
- `recordStatus`

Projections are rebuilt on each bounded query; no canonical business data is copied.

## Date semantics

- `date` fields keep their canonical `YYYY-MM-DD` value and are treated as all-day events.
- `datetime` fields are treated as timed events using the stored ISO timestamp.
- End dates for all-day ranges are stored inclusively in Records and adjusted to end-of-day for display/overlap only.
- Missing or invalid dates on a single Record are isolated; they do not corrupt canonical data.

## Bounded query architecture

The Calendar Engine accepts a requested window (`windowStart`, `windowEnd`). It:

1. Loads the active `CalendarDefinition`.
2. Resolves the source Module/Workset/EntityType.
3. Queries canonical Records scoped to the Workspace and source, optionally bounded by status.
4. Filters Records to the requested window using mapped start/end values.
5. Maps matching Records into projections.
6. Resolves `resourceField` EntityReferences through the canonical Entity service.
7. Returns a bounded, stably ordered list of events.

Multiple `CalendarDefinition`s can coexist and can be displayed through the same Calendar View.

## Views

- **Month**: 7-column grid with day cells and event pills.
- **Week**: 7-day column view.
- **Day**: single-day event list.
- Navigation: previous / next / today and Month/Week/Day switch.
- Event click navigates to canonical `RecordDetailPage`.

## Authorization

- Reading Calendar views follows normal Workspace membership.
- Managing CalendarDefinitions requires Personal Workspace ownership or Organization OWNER/ADMIN.
- MEMBER users cannot create, update, or delete CapabilityDefinitions.
- Cross-Workspace source references are rejected by the registry and service.

## Firestore rules

`workspaces/{workspaceId}/capabilityDefinitions/{definitionId}`:

- Read allowed for any Workspace member.
- Write/delete allowed only for Workspace managers.
- Enforces Workspace match, definition identity immutability, bounded safe configuration, allowed engine IDs/versions, typed source refs, and valid lifecycle statuses.
- Rejects executable configuration keys (`script`, `eval`, `rawQuery`, `collectionPath`, etc.).

## Reset and caching

- Workspace Reset removes all `capabilityDefinitions` for the Workspace.
- Identity, memberships, core entity types, and audit evidence are preserved.
- Calendar projections are derived at query time. If caching is introduced later, it must be Workspace-scoped, bounded, rebuildable, and invalidatable.

## Module Designer integration

CalendarDefinitions are configured independently from `FormSchema`. The Module Designer "Capabilities" seam now shows Calendar as operational and lets authorized users create a `CalendarDefinition` for the current Module. Configuration is persisted through the generic CapabilityDefinition service, not embedded in the Module document.

## Workspace Architect / Automat

- The Workspace Architect capability catalog correctly reports Calendar as `AVAILABLE` and operational.
- AI can propose Calendar requirements; deterministic Core validates them.
- Trusted Automat apply does not create CapabilityDefinitions. Generating operational CalendarDefinitions is deferred to the Designer handoff or a future trusted-apply generic CapabilityDefinition write group with human approval.

## Module version compatibility

- CalendarDefinitions are validated against the current source Module schema.
- Historical Records retain their exact `moduleVersion`.
- If a Module version removes or renames a mapped field, the affected definition becomes invalid and degrades gracefully (no silent reinterpretation, no historical mutation).

## Known limitations

- No drag/drop rescheduling or Record mutation from the Calendar.
- No recurring-event engine.
- No external calendar sync (Google/Outlook/CalDAV).
- No resource conflict detection or scheduling optimization.
- No arbitrary user-defined filters or queries.
- Full record-level authorization granularity (e.g., employee-only Records) is not yet implemented beyond Workspace/Module access.

## Verification

- 703 unit tests pass.
- 287 Firestore Rules/Emulator tests pass, including new CapabilityDefinition authorization tests.
- Build succeeds.
- Lint passes.
- Reset Test Hotel browser verification shows Reservation and Holiday calendars through the same engine, event click opens Record Detail, and no duplicated event documents are created.
