# ADR-0005 — Generic CapabilityDefinition Persistence and First Operational Calendar Engine

## Status

Accepted.

## Context

Step 10.2 established a loosely coupled Capability Engine architecture but intentionally deferred persistence because no runtime consumed CapabilityDefinitions. Step 10.4 introduces the first operational engine (Calendar), which needs a trusted place to store declarative definitions, enforce their lifecycle, and allow multiple Workspace-specific configurations without duplicating canonical business data.

## Constraints

- One generic persistence model must serve future engines, not a Calendar-specific schema.
- Definitions remain configuration only; they cannot carry executable code, arbitrary paths, authority, or entitlement.
- Workspace authorization, Reset, and Firestore Rules must treat CapabilityDefinitions as Workspace-owned configuration.
- Calendar must remain a derived projection over canonical Records; it cannot own Reservation/Holiday/Meeting business data.
- Multiple CalendarDefinitions must coexist safely.

## Options considered

1. Calendar-specific collection and service (`calendarDefinitions`). Simplest for one engine but forces a new persistence model for every future engine.
2. Generic `capabilityDefinitions` collection with engine-agnostic shape plus engine-specific configuration. Reuses one repository/service and naturally supports future engines.
3. Embed Calendar mappings inside ModuleDefinition. Violates the Step 10.2 separation and couples Module lifecycle to optional capabilities.

## Decision

Adopt option 2.

A generic `capabilityDefinitions` workspace-scoped collection stores versioned CapabilityDefinitions. The document contains:

- definition identity and version
- engineId and contractVersion
- typed canonical source reference
- bounded declarative configuration
- lifecycle status
- provenance and timestamps

Calendar is the first `AVAILABLE` engine. The `CalendarEngine` reads canonical Records through the source Module, maps selected fields to `CalendarEventProjection`, resolves EntityReference labels, and returns bounded projections. No Calendar event store is introduced.

## Consequences

- Future engines can reuse the same persistence, service, and Rules foundation by registering a descriptor and engine-specific validator.
- Workspace Reset removes CapabilityDefinitions while preserving identity, memberships, core entity types, and audit evidence.
- CalendarDefinitions can be created, activated, deactivated, and archived independently from Modules.
- Module Designer configures Calendar through the generic capability seam without embedding configuration in FormSchema.
- Trusted Automat apply for CapabilityDefinitions is not implemented; Calendar creation is a Designer handoff or future approved write group.

## Security consequences

- Firestore Rules restrict writes to Workspace managers, enforce Workspace scope, immutable identity/provenance, allowed engine IDs/versions, typed source refs, and reject executable configuration keys.
- MEMBER denial, cross-Workspace rejection, and unsafe-configuration rejection are explicitly tested.
- CapabilityDefinitions cannot grant authority or bypass Record authorization.

## Deferred

Drag/drop rescheduling, recurring events, external calendar sync, scheduling optimization, conflict resolution, resource allocation, and trusted Automat apply for CapabilityDefinitions.
