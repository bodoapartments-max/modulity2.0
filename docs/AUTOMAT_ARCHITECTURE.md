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

Step 9.0 does not analyze real organizations, apply plans, write Firestore, create Modules, generate React/JSX, invoke external AI, or require provider secrets.

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

Step 9.0 keeps AgentExecutionResult and AutomatBuildPlan domain-only and in-memory. Persistence is intentionally deferred because plans cannot yet be applied and trusted authorization, server timestamps, lifecycle transitions, retention, audit, and idempotent apply semantics belong to later milestones.

Therefore Step 9.0 adds no `automatPlans` collection, repository, Firestore Rules, indexes, or browser-writable trusted actor path.

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

## Explicit deferrals

### Step 9.1 not implemented

- Real organization/industry reasoning
- LLM prompts or provider calls
- Confidence-driven product behavior
- Organization analysis UI

### Step 9.2 not implemented

- BuildPlan approval persistence
- Apply/application service
- Canonical Entity Type, Module, Relationship, Workset, Widget, or Report writes
- Plan-reference-to-resource-ID mapping
- Apply idempotency, migrations, rollback, or audit

Also deferred: automation rules, triggers/actions, webhooks, API tokens/service identities, external-agent execution, persisted execution history, cancellation signals, provider retries, and multi-agent workflows.
