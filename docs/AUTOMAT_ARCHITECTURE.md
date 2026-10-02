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

Step 9.0 established contracts and Step 9.1 generates/reviews plans through deterministic specialist Agents. Step 9.2 adds a separate trusted deterministic apply boundary; Agents still cannot write Firestore, generate React/JSX, invoke external AI during apply, or receive canonical authority.

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

## Step 10.1 — Automat Workspace Architect

The Workspace Architect evolves existing configuration rather than generating an isolated replacement system:

```text
Business request
→ bounded WorkspaceConfigurationSnapshot
→ in-memory WorkspaceSemanticModel
→ provider-neutral WORKSPACE_ARCHITECT Agent
→ WorkspaceEvolutionPlan
→ existing AutomatBuildPlan
→ deterministic validation/classification
→ review/approval
→ existing trusted Step 9.2 apply
```

`WorkspaceSemanticModel` contains configuration metadata only: Core/Domain Entity Types and fields, Modules/Form schemas/EntityReference targets, Worksets, Widgets, Reports, and review-only relationship metadata. Operational Entities and Records are excluded. Stable sorting, per-kind/item/field/byte bounds, deterministic truncation, and `ANALYSIS_INCOMPLETE` prevent silent partial-context assumptions.

The Architect applies reuse-before-create and thing-versus-process reasoning. Semantic interpretation can explain that waiter→EMPLOYEE, vendor→SUPPLIER, company car→VEHICLE, or tools→EQUIPMENT, but deterministic BuildPlan classification remains authoritative. Same-code incompatible schemas become CONFLICT. SAFE_UPDATE, DELETE, replacement, operational Entity generation, and RelationshipDefinition remain unsupported.

Each significant decision stores concise rationale, requested concept, operation, target ref, and planning confidence—not hidden model reasoning. Ambiguous requests produce required clarification and are not persisted for approval. Repeated requests compile to the same stable refs and converge on REUSE.

Calendar-compatible processes use canonical date/datetime fields such as `startDateTime`, `endDateTime`, `dueDate`, and `appointmentDateTime`; no Calendar event copies are created.

Authenticated `modulity-2-dev` verification analyzed 22 existing hotel resources, reused five Core concepts, created 15 restaurant/inventory configuration resources through the trusted apply engine, and fabricated zero Entity instances. The repeated request analyzed 37 resources and applied CREATE 0 / REUSE 20 without duplicates. Room Inspection reused ROOM/EMPLOYEE and proposed only a Module, Workset, and Report. Ambiguous storage produced clarification with no approval path. Desktop, 768px, and 375px review passed. Deterministic conflict coverage rejects an incompatible same-code TABLE without mutation.

See ADR-0003.

## Step 9.2 — Trusted BuildPlan Application

```text
reviewed in-memory plan
→ automatPlan callable persists and revalidates
→ immutable SHA-256 plan/configuration fingerprints
→ OWNER/Personal-owner approval
→ automatApplyPlan callable
→ current snapshot/fingerprint verification
→ Workspace apply lock and idempotent operation journal
→ Entity Types → Modules/version snapshots → Worksets → Widgets → Reports
→ post-apply verification
→ Audit + one completion Notification
```

Plans persist at `workspaces/{workspaceId}/automatPlans/{planId}`. Browser clients may read through Workspace access but cannot create or mutate plans. The trusted callable owns READY_FOR_REVIEW → APPROVED → APPLYING → APPLIED/FAILED transitions. Approval binds planId, planVersion, plan fingerprint, Workspace, approver, and planning configuration fingerprint.

Operations persist at Admin-only `automatApplyOperations/{operationId}`. The Workspace lock is `workspaceAutomatOperations/{workspaceId}` and uses a ten-minute renewable lease. Minimal external evidence persists at `automatApplyAudits/{operationId}`. The operation stores resource-level classifications/actions/statuses and PlanReference→canonical ID mapping, never operational payload copies.

CREATE rechecks canonical code/name identity. REUSE verifies compatibility through the current BuildPlan classification. SAFE_UPDATE is disabled for every resource type; incompatible changes remain CONFLICT and require a future migration policy. REPLACE_DELETE does not exist.

Application is phase-based, not globally atomic. Successful resources remain canonical after partial failure. The operation records PARTIAL_FAILED and the current configuration fingerprint. Retry with the same operation ID resumes, reclassifies successful resources as REUSE, and never destructively rolls back.

Type-level relationship proposals do not match the canonical instance Relationship model. They are optional UNSUPPORTED review recommendations, omitted from apply, and do not block an otherwise coherent plan. EntityReference fields remain the supported Record→Entity mechanism. No RelationshipDefinition model or fake Entity instances are introduced.

Automat-created Modules are ACTIVE with immutable Version 1 snapshots, permanent code reservations, and declarative `displayConfig` list fields. The generic Module Record List renders those fields with a Form Schema fallback, resolves EntityReference labels, and opens canonical Record Detail by recordId. System application creates no Records, Entity instances, Ledger Books, Ledger Entries, or sequence allocations.

The server entitlement integration point currently grants `automat.system_builder` only in the `modulity-2-dev` project or Emulator after independent authority verification. Subscription-backed server entitlement resolution remains required before production availability.

Workspace Reset deletes Workspace-scoped plans and canonical generated configuration, clears non-historical Workspace apply lock state, and preserves top-level apply operation/audit evidence.

Deployment verification on `modulity-2-dev` passed with Node.js 22 v2 callables `automatPlan` and `automatApplyPlan` in `europe-west1`. `Reset Test Hotel` completed trusted CREATE apply (14 resources), canonical Room Entity and Reservation Record creation, generic two-Record Module list/detail navigation, and an equivalent second plan with CREATE 0 / REUSE 14 and no duplicate counts. OWNER approval, fingerprints, audit, notification, cache refresh, Dashboard/Widgets/Reports, desktop, 768px, and 375px flows passed. Emulator coverage proves MEMBER/cross-Workspace denial, Personal owner, stale plan, conflict, partial failure/resume, and concurrent/idempotent operation behavior.

The browser smoke exposed and fixed uppercase Firestore sort directions reaching `orderBy()`, which caused Firebase's internal assertion and misleading index errors. Record directions are normalized to lowercase, ascending/descending composite indexes are canonical and deployed, and Module Record tables now use declarative/fallback Form columns with batched EntityReference labels and accessible canonical Record navigation.

## Remaining deferrals

- Subscription-backed server entitlement resolution
- Any SAFE_UPDATE policy
- RelationshipDefinition architecture
- Destructive migration/rollback
- Production background jobs for plans beyond current bounds
- Automation rules, triggers/actions, webhooks, API tokens/service identities, external-agent execution, cancellation signals, provider retries, and multi-agent workflows
