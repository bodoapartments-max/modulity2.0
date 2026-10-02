# ADR-0002: Trusted Automat BuildPlan Application Boundary

- Status: Accepted
- Date: 2026-10-02

## Context

Step 9.2 is the first Automat milestone that may create canonical Workspace configuration. Browser execution, direct Agent writes, and mutable client plan payloads cannot provide plan integrity, authorization, stale-plan protection, idempotency, concurrency control, durable journaling, or trustworthy audit.

The Step 9.1 relationship proposals describe type-level recommendations, while the canonical Relationship model links actual Entity/Record/Module/File instances. Treating Entity Type IDs as Entity endpoints would create malformed canonical data.

## Decision

Use narrow Firebase callable Functions in `europe-west1` on Node.js 22 for plan persistence/approval and deterministic application. The trusted boundary verifies Firebase Auth, Personal owner or Organization OWNER authority, the development entitlement integration point, immutable plan/configuration fingerprints, lifecycle, current snapshot, Workspace lock, operation idempotency, canonical validators, phased resource application, journal, and post-apply verification.

Persist validated plans under `workspaces/{workspaceId}/automatPlans/{planId}`. Clients may read plans through ordinary Workspace access but cannot write lifecycle or payload fields. Persist locks/operations and minimal apply audit outside the Workspace reset dataset in Admin-only top-level collections.

Step 9.2 supports CREATE and REUSE. SAFE_UPDATE is disabled for every resource type until a separately proven additive/versioned policy exists. CONFLICT blocks apply. Type-level relationship proposals are optional UNSUPPORTED review recommendations and are omitted from apply; no RelationshipDefinition model or fake Entity instances are introduced.

Application order is Entity Types, Modules, Worksets, Widgets, Reports, then verification. Successful resources remain after partial failure. Retry/resume revalidates and reuses compatible resources rather than deleting them.

## Consequences

- Agents and browser code never receive canonical write authority.
- The applied payload is the immutable server-persisted and fingerprinted plan.
- No REPLACE_DELETE or destructive rollback exists.
- Apply is not globally atomic; operation journaling and deterministic resume are authoritative.
- Existing instance-level Relationship architecture remains unchanged.
- Subscription-backed entitlement resolution remains a documented server integration limitation; the development callable grants only the named Automat capability after authority verification.
- Automat-created Entity Types, Modules, Worksets, Widgets, and Reports remain compatible with Workspace Reset's existing canonical reset allowlist.
