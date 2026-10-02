# Automat Architecture

## Step 9.0 status

Step 9.0 defines planning infrastructure only:

```text
User Intent
→ Agent Orchestrator
→ registered specialist Agent
→ structured versioned output
→ AutomatBuildPlan
→ deterministic BuildPlan validation/classification
→ STOP
```

Agents propose. Core validates. A human reviews. A future deterministic application service may execute an approved plan in Step 9.2 through existing canonical services.

Step 9.0 established contracts without organization reasoning. Step 9.1 now generates and reviews plans through deterministic specialist Agents, but still does not apply plans, write Firestore, create canonical resources, generate React/JSX, invoke external AI, or require provider secrets.

## Agent infrastructure

`src/agents/` contains:

- `contracts/agentContracts.js` — strict AgentDefinition, AgentExecutionRequest, and AgentExecutionResult contracts and size/timeout bounds.
- `registry/agentRegistry.js` — versioned registration, status resolution, and capability/entitlement boundary.
- `providers/agentProviderAdapter.js` — provider-independent execution boundary.
- `providers/deterministicTestAdapter.js` — deterministic test implementation; not an AI provider.
- `orchestrator/agentOrchestrator.js` — input validation, adapter execution, timeout/error normalization, output validation, and provenance.
- `automat/automatContracts.js` — BuildPlan, plan references, bounded WorkspaceConfigurationSnapshot, lifecycle/classification constants, and Organization Analyzer contracts.
- `automat/buildPlanValidator.js` — deterministic validation and CREATE/REUSE/CONFLICT classification.

The Orchestrator has no repository dependency and no canonical mutation method.

## Agent and provider trust

Provider output is untrusted structured input. The Orchestrator enforces contract versions, serializability, size bounds, timeout boundaries, and configured deterministic input/output validators. Provider adapters cannot acquire authority from a confidence score or provider identity.

Future capability questions use the Entitlement boundary, for example:

- `automat.organization_analysis`
- `automat.system_builder`
- `agent.external`

Step 9.0 injects `canUse(capability, context)` into the Agent Registry. It does not implement plans, pricing, subscriptions, or usage persistence.

## AutomatBuildPlan

A BuildPlan is declarative review data, not executable code and not canonical operational data. It can represent:

- Organization profile and industry analysis
- Business areas, domain objects, processes, and capabilities
- Proposed Domain Entity Types
- Proposed Modules and Form Schemas
- Proposed Relationships
- Proposed Worksets
- Proposed WidgetDefinitions
- Proposed ReportDefinitions
- Warnings and unresolved questions
- Agent/source provenance

It contains no Records, Entities, Ledger history, Messages, Notifications, credentials, raw provider prompts, or executable components.

## Stable plan references

Plan resources use temporary references such as:

- `entityType:ROOM`
- `module:RESERVATION`
- `workset:FRONT_DESK`
- `widget:OCCUPANCY`

No Firestore IDs are allocated during planning. Step 9.2 may map temporary references to canonical IDs after approval and authorization.

## Deterministic validation

Validation reuses implemented contracts:

- Entity Type `validateFieldDefinitions()` and `ENTITY_FIELD_TYPES`
- Module `validateModuleCode()`
- Form `validateFormSchema()`
- Widget `validateWidgetQuery()`
- Report/analytics `validateAnalyticsDefinition()`

The implemented shared field registry is authoritative. Older conceptual types in the early Module blueprint that are not implemented remain unsupported and are rejected.

Validation produces `VALID`, `VALID_WITH_WARNINGS`, or `INVALID` plus machine-readable issues containing code, severity, path, message, and related reference.

Checks include versions, Workspace consistency, strict resource properties, duplicate references/codes, broken references, Form/Entity fields, Widget/Report sources, Workset Modules, supported platform capabilities, unsafe keys, nesting, serialized size, and count limits.

## Existing-resource classification

Operations are classified as:

- `CREATE`
- `REUSE`
- `SAFE_UPDATE`
- `CONFLICT`
- `UNSUPPORTED`

Step 9.0 actively classifies compatible Entity Types and Modules as REUSE, new resources as CREATE, and incompatible same-code resources as CONFLICT. `SAFE_UPDATE` and `UNSUPPORTED` are reserved for future deterministic policy.

There is no `REPLACE_DELETE`. A conflict never deletes, archives, overwrites, or mutates a canonical resource.

## WorkspaceConfigurationSnapshot

Planning context is bounded to at most 100 summaries per resource type for:

- Domain Entity Types
- Modules and relevant versions/schema summaries
- Relationships/configuration
- Worksets
- WidgetDefinitions
- ReportDefinitions

It excludes Records, Entity instances, Ledger history, Messages, Notifications, Files, and Audit history. No global listener or whole-Workspace hydration is introduced.

## Persistence decision

Step 9.0 and Step 9.1 keep AgentExecutionResult and AutomatBuildPlan domain-only and in-memory. Persistence is intentionally deferred because plans cannot yet be applied and trusted authorization, server timestamps, lifecycle transitions, retention, audit, and idempotent apply semantics belong to later milestones.

Therefore Step 9.1 adds no `automatPlans` collection, repository, Firestore Rules, indexes, or browser-writable trusted actor path.

## Provenance

Execution results include requester, request ID, Agent ID/code/version, input/output schema versions, provider adapter type, contract version, status, and execution timestamps. BuildPlans include source execution references and contribution metadata. Secrets and raw provider credentials are forbidden.

Agent provenance is not a USER identity. Browser clients still cannot claim trusted `INTERNAL_AGENT` actors for canonical writes.

## Bounds

- Agent input: 64 KB
- Agent output: 256 KB
- Agent context keys: 32
- Agent timeout: 1–120,000 ms
- BuildPlan: 512 KB
- Entity Types: 50
- Modules: 50
- Relationships: 100
- Worksets: 25
- Widgets: 50
- Reports: 50
- Fields per proposed resource: 50
- Snapshot summaries: 100 per resource type
- Nested plan depth: 12

## Deterministic fixtures

The hotel fixture proves that generic contracts represent ROOM, GUEST, RESERVATION, STAY, operational Modules, Relationships, Worksets, Widgets, and Reports without `industry === "hotel"` core logic.

The existing-Workspace fixture classifies compatible ROOM and RESERVATION resources as REUSE. The invalid fixture deterministically rejects duplicate Module codes, broken Entity references, unsupported fields, and unsafe Widget sources.

## Step 9.1 — Organization Analyzer and System Planner

Step 9.1 implements a planning-only specialist pipeline:

```text
Organization Analyzer
→ Domain Model Planner
→ Process Planner
→ Module Planner
→ Workspace Experience Planner
→ System Reviewer
→ AutomatBuildPlan
→ deterministic BuildPlan Validator
→ human review
→ STOP
```

Every stage runs through the Step 9.0 Agent Registry, execution contracts, deterministic input/output validators, provider adapter, timeout boundary, and provenance result. Handoffs are structured versioned objects rather than free-text prompts.

The executable Step 9.1 provider is `DETERMINISTIC_TEST`, backed by structured operating-domain knowledge for hospitality/hotel, performing arts/theatre, and education/school. Knowledge selection scores organization terminology against configuration; Core validation contains no industry branching. No live AI, API key, vendor, model, or paid service is required.

Every specialist resolves the injected capability boundary. The development runtime grants only `automat.organization_analysis` and `automat.system_builder` when authenticated Workspace/requester context is present. Subscription-backed trusted entitlement enforcement is required before remote providers or persisted usage are introduced.

The analyzer produces a structured profile, business areas, domain-object classifications, assumptions, questions, and terminology. Domain objects are explicitly classified as Core reuse, Domain Entity, Record/process data, or configuration. The planners produce declarative supported Form Schemas, EntityReferences, processes, capabilities, Relationships, Worksets, Widgets, and Reports.

The reviewer emits diagnostics for coverage, unsupported capabilities, warnings, conflicts, generic-module ratio, and orphan references. Generic administration dominating a specialized plan produces a warning. Diagnostics never grant security or approval authority.

`/app/automat` is lazy-loaded and supports IDLE, ANALYZING, PLANNING, VALIDATING, READY, and ERROR states. Review uses user-facing sections and has no functional Apply action. Plans remain in memory.

Before and after planning, the application loads a bounded configuration snapshot using six parallel configuration queries. It verifies the snapshot fingerprint is unchanged. Entity Type and Module list reads are capped at 100. Planning reads no Records, Entity instances, Ledger, Messages, Notifications, Files, or Audit history.

Deterministic tests cover hotel, theatre, school, stable identities, REUSE, CONFLICT, quality gates, malformed/oversized provider output, missing stages, timeout, failure, bounded snapshots, no mutation, and UI settlement.

Authenticated browser verification on `modulity-2-dev` used the clean disposable `Reset Test Hotel` Workspace and the deterministic provider. The hotel description produced six domain-specific Business Areas, five Business Objects, four Processes, four operational Modules with supported fields and EntityReferences, three Worksets, three Widgets, three Reports, explicit questions/assumptions, and `VALID` with zero issues. Dashboard and every canonical configuration page remained empty afterward. Desktop, 768px, and 375px review flows passed.

## Explicit deferrals

### Step 9.2 not implemented

- BuildPlan approval persistence
- Apply/application service
- Canonical Entity Type, Module, Relationship, Workset, Widget, or Report writes
- Plan-reference-to-resource-ID mapping
- Apply idempotency, migrations, rollback, or audit

Also deferred: automation rules, triggers/actions, webhooks, API tokens/service identities, external-agent execution, persisted execution history, cancellation signals, provider retries, and multi-agent workflows.
