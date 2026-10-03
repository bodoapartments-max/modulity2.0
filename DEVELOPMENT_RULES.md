# Modulity 2.0 — Development Rules

These rules are mandatory for every Modulity 2.0 development task.

Read this document before planning or modifying code.

If a requested implementation conflicts with these rules or with an authoritative architecture document, stop and report the conflict instead of silently violating the architecture.

Implementation convenience is not sufficient justification for breaking these rules.

Detailed architecture documents remain authoritative for their respective domains. This document is the mandatory cross-cutting development guardrail; it consolidates recurring engineering constraints without replacing detailed contracts.

---

## 1. Documentation hierarchy

Read the documents relevant to the task before changing a contract:

| Document | Authority |
|---|---|
| [`docs/PROJECT_CONSTITUTION.md`](docs/PROJECT_CONSTITUTION.md) | Foundational, non-negotiable platform principles |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Platform layers, dependency direction, subsystem boundaries |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Canonical data contracts and relationships |
| [`docs/MODULE_CONTRACT.md`](docs/MODULE_CONTRACT.md) | Module, Form Schema, view, Widget, Report, and runtime contracts |
| [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) | Authorization, isolation, trust, actor, and Rules boundaries |
| [`docs/EVENT_MODEL.md`](docs/EVENT_MODEL.md) | Event, Audit, Notification, correlation, and delivery semantics |
| [`docs/AGENT_ARCHITECTURE.md`](docs/AGENT_ARCHITECTURE.md) | Agent contracts, registry, orchestration, providers, and safety |
| [`docs/BILLING_MODEL.md`](docs/BILLING_MODEL.md) | Entitlements, plans, subscriptions, limits, provider adapters |
| `DEVELOPMENT_RULES.md` | Mandatory cross-cutting implementation guardrails |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestone scope and sequencing |
| [`AGENTS.md`](AGENTS.md) | Practical repository commands and discovery guidance |
| [`docs/decisions/`](docs/decisions/) | Explicit major architecture decisions (ADRs) |

A lower-level or newer convenience document does not silently override a domain authority. If authorities conflict, follow the conflict process below.

## 2. Conflict handling

If a user request, task prompt, existing implementation, this rulebook, or an authoritative architecture document appear inconsistent:

1. Stop before making an architecture-changing implementation.
2. Identify the conflicting statements.
3. Identify the affected subsystem, data, security boundary, and consumers.
4. Present viable options and their migration/security consequences.
5. Request or record an explicit architecture decision.
6. Continue only after the conflict is resolved or the task is narrowed to non-conflicting work.

Do not settle major architectural conflicts indirectly through code.

## 3. Modulity is a platform, not a website

The React application is one client of the Modulity platform. Future clients may include Web, native/mobile applications, a WordPress Plugin, Gutenberg Blocks, shortcodes, embedded forms, embedded Widgets, public/guest forms, external business integrations, external agents, and authenticated API consumers.

Business capabilities must not work only inside a React page. Preserve the conceptual boundary:

```text
Client
→ Application / Platform Service
→ Authorization / Entitlement
→ Domain / Core Service
→ Repository / Trusted Backend
```

The exact transport may evolve, but client presentation and canonical business meaning must remain separate. Do not implement Mobile or WordPress unless explicitly requested.

## 4. One platform, multiple clients

A Vehicle Inspection Module is the same canonical Module whether rendered by Web, Mobile, WordPress, or an embedded client. Presentation may differ. Validation, permissions, Module version, Record meaning, Ledger behavior, and Audit provenance must not.

Ask for every business capability:

> Could a future Mobile client, WordPress Plugin, embedded client, or API consumer use this capability without reimplementing its business rules?

If the answer is no because canonical rules exist only in React, reconsider the design. Do not prematurely expose every service publicly; preserve boundaries that a future API can safely expose.

## 5. Canonical data and one source of truth

Firestore/backend canonical data is authoritative. Never create a second authoritative business-data store for convenience.

Do not duplicate canonical Records, Entities, Relationships, Modules, Ledger history, Audit history, Widget business data, or Report business data into localStorage or parallel collections.

Client caches are allowed only as presentation/performance optimizations:

```text
Cache != source of truth
View != source of truth
Notification reference != resource authorization
LedgerEntry != Record copy
Report/Widget output != canonical business data
```

## 6. Workspace query cache

The Step 7.1 workspace query cache is presentation infrastructure. It may provide stale-while-revalidate, prefetching, request deduplication, and fast navigation.

Mandatory cache rules:

- Every business-data key includes `workspaceId`, resource, and normalized query/filter/page.
- Mutations update or invalidate relevant cache entries.
- Cached content may remain visible during `REFRESHING`.
- Cache failure does not redefine canonical state.
- Large collections remain bounded and paginated.
- Cache entries must never leak Workspace A data into Workspace B.
- Do not restore V1-style localStorage business-data duplication.

## 7. Preserve core object separation

Do not collapse these concepts because one feature would become easier:

- Workspace
- Module
- Form Schema
- Record
- Entity
- Relationship
- Workset
- Favorite
- WidgetDefinition
- Notification
- Event
- AuditEntry
- LedgerEntry
- Conversation / ConversationMember / Message

### Module != Form != Record != Entity

- Module defines a capability/process.
- Form Schema defines declarative structured input.
- Form Renderer presents the schema.
- Submission uses the Module contract and deterministic services.
- Record is canonical operational data.
- Entity is a persistent business object.

Example:

```text
Vehicle             = Entity
Vehicle Inspection  = Module
Inspection form     = Form Schema / rendered Form
Completed inspection = Record
```

## 8. Record-centric architecture

A single canonical Record may power ListView, Table View, Dashboard, Widget, Report, Notification reference, Ledger reference, Search, and Audit history. Never create per-view Record copies.

Print output, single-Record exports, and Calendar projections are also views over the same canonical Record. They must read the Record the user is authorized to see and must not store or mutate presentation-derived copies.

Canonical Record lifecycle mutations execute through trusted Record commands (`recordCommand`). Client UI may request an action, but must never directly author lifecycle state, actor identity, or timestamps. The command implies the transition; the server owns it.

Canonical Audit evidence must be authored by trusted server boundaries. Ledger sequence allocation and immutable registration must never be client-authoritative. Clients may project Ledger/Audit data but must not author immutable evidence.

Records preserve the exact Module version/schema context under which they were created. Updating a Module must not silently reinterpret historical Records.

## 9. Entity ownership and extensibility

Entities belong to the Workspace/domain, not to individual Modules. Modules reference and operate on canonical Entities.

Example: Room 214 may be referenced by Reservation, Check-in, Housekeeping, Maintenance, Damage Report, and Renovation while existing once.

Preserve stable Core Entity Types and extensible Domain Entity Types. Do not force Hotel, School, Theatre, Construction, or other domain objects into unsuitable legacy Core types.

## 10. Worksets and Favorites

Workset is context, not authorization. Activating Office, Warehouse, Field Installation, Hotel Front Desk, or Maintenance may alter presentation/navigation; it cannot grant Module or business-data access.

Favorite is personal convenience/frequency. Workset is a contextual Module collection. Do not merge them.

## 11. Multi-Workspace first

Never assume one global company. A User may have a Personal Workspace and memberships in multiple Organizations.

- Every workspace-scoped operation resolves an explicit Workspace.
- No global company singleton.
- No cross-workspace cache reuse.
- No cross-workspace Firestore access.
- Workspace switching must not display prior Workspace data under the new Workspace.

Personal Workspace is first-class and uses the same platform architecture. Features work in Personal and Organization Workspaces unless their business meaning explicitly requires an Organization.

## 12. Identity separation

Preserve distinctions among User, Person, Employee, Membership, Role, Position, Permission, Module Access, Group, Workset, and Assignment.

Employee Entity is not the authenticated User. Role is not Position or Permission. Group is not Workset.

Use immutable internal identifiers for authority. Human-readable references are separate. Do not encode critical authorization or chronology into display IDs or expose email/full identity as public reference numbering.

## 13. Security is outside the UI

UI visibility is not authorization. Hiding a button is not security.

Enforce access at deterministic boundaries: Firestore Rules and/or trusted backend/application services. Never trust client-supplied `workspaceId`, `userId`, actor type, state transition, entitlement, sequence, or provenance without appropriate validation.

Every new client-writable collection requires a Rules review covering:

- Workspace isolation
- ownership/membership
- immutable identity/provenance
- actor spoofing
- state transitions
- cross-resource provenance
- create/update/delete policy
- negative emulator tests

If a guarantee cannot be enforced with browser + Rules, document the limitation. Do not describe client logic as trusted infrastructure.

## 14. AI and agent boundaries

The platform must work with all agents disabled. AI is never final authority for authentication, authorization, permissions, entitlements, Ledger numbering, Audit integrity, canonical validation, or security-sensitive transitions.

Use specialized, registered agents with explicit versioned input/output contracts and replaceable provider adapters. Preserve the Agent Registry and orchestration boundary where defined.

Preferred flow:

```text
Agent proposes configuration/draft
→ deterministic validation
→ authorization / entitlement
→ Core Service
→ canonical operation
```

Forbidden shortcut:

```text
Agent → arbitrary trusted database mutation
```

External agents/integrations use controlled APIs, service identities/tokens, scoped permissions, rate limits, idempotency, and audit attribution. They do not receive privileged database shortcuts.

## 15. React responsibilities

React components primarily handle presentation, interaction, local presentation state, and calls to application services. Canonical validation, permissions, transitions, numbering, and reusable business operations belong in Core/Application services.

Browser-specific behavior must be isolated behind presentation/adapters. Do not make DOM behavior part of business meaning.

## 16. Form Schema portability

Form Schemas remain declarative and versioned. Do not require arbitrary React code for normal field behavior. Stable field contracts must be interpretable by Web, Mobile, and embedded renderers.

## 17. Widget and Report definitions

Normal Widgets are configuration interpreted by deterministic renderers:

```text
WidgetDefinition → controlled query/renderer → canonical data
```

Do not store generated React components as the default Widget model. Exceptional custom extensions require a future controlled extension decision.

Future Reports follow:

```text
ReportDefinition → deterministic Report Engine → canonical Records/Entities → output
```

Reports and Widgets are projections/aggregations, not duplicate business stores. User-configurable queries use allowlisted sources, fields, operators, paths, and bounded limits.

## 18. WordPress and Mobile compatibility

A future WordPress Plugin, Gutenberg Block, shortcode, embedded Form, or Widget consumes Modulity capabilities; WordPress never becomes a second Modulity backend.

A future Mobile client may render the same Module/Form definitions with native presentation. Business validation and canonical operations remain shared.

Do not add WordPress- or Mobile-specific code until requested. Keep browser-only features behind adapters.

## 19. Ledger integrity

Preserve all Step 6/6.1 invariants:

- Numbering is atomic, idempotent, and concurrency-safe.
- Same Record + same Ledger Book consumes one sequence.
- Existing LedgerEntry is never silently overwritten.
- Cancelled/voided numbers are never reused.
- Historical entries remain traceable and are not physically deleted.
- Record↔Ledger consistency and server timestamps remain intact.
- Client trust limitations remain documented until a trusted backend exists.

Do not simplify UI by weakening Ledger history or rules.

## 20. Events, Audit, Notifications, and Chat

Keep these systems distinct:

- Event: platform/domain occurrence.
- AuditEntry: durable accountability/provenance.
- Notification: selective recipient-facing consequence referencing canonical resources.
- LedgerEntry: durable numbered register identity.
- Message: bounded conversation content protected by Conversation membership.

Do not convert every Event into a Notification. Notifications do not grant access to referenced resources. Audit is not Event, Notification, or Ledger.

Browser clients cannot impersonate trusted actor types. Historical Ledger/Audit/security-sensitive time uses server-authoritative timestamps.

Chat uses canonical Workspace identity and ConversationMember access. Sharing a Workspace alone does not expose Messages. Message history is bounded/paginated and Messages are append-only where defined.

## 21. Entitlements and billing

Do not scatter plan names, prices, or paid/free checks through components. Core asks capability questions such as `canUse('advanced-reports')` through the Entitlement/Capability architecture.

Prices and limits remain configuration/provider data. Payment providers are adapters and replaceable. Usage counters update from successful trusted operations, not client claims.

## 22. Files and attachments

File metadata and resource relationships remain canonical. Do not embed uncontrolled large binary data in ordinary Record documents. Use the approved storage abstraction and enforce Workspace/resource access.

## 23. Versioning, migration, and history

Before changing a Core contract, identify consumers, historical impact, security impact, migration requirements, documentation, and tests.

Never silently delete/rewrite canonical history because a Module, Automat configuration, schema, or UI changed. Prefer versioning, migration, archive, supersession, and explicit provenance.

## 24. Performance rules

Performance is architectural:

- Do not hydrate an entire Organization at startup.
- Use bounded queries, pagination, caching, small-resource prefetch, lazy routes, and code splitting.
- Preserve cached content during background refresh.
- Avoid unbounded reads, global business-data hydration, listener explosion, and duplicate listeners.
- Large Records, Entities, Ledger Entries, Notifications, Messages, and Audit histories require bounded pages/cursors.

## 25. Async state and error handling

Use consistent states:

```text
IDLE
INITIAL_LOADING
READY
REFRESHING
ERROR
```

Empty is a valid READY state. Loading is not Empty. During `REFRESHING`, preserve usable cached content where appropriate.

Every async path must resolve, reject, or reach an explicit diagnostic failure boundary. Do not swallow errors into permanent loading. Feature errors must not poison unrelated global state (for example, Widget failure must not mean Workspace unavailable).

## 26. Responsive design, accessibility, and Design System

Every normal feature considers desktop, laptop, tablet, and mobile. Presentation adapts; business behavior stays shared. Avoid fixed layouts that block responsive web or future clients.

Use semantic controls, labels, keyboard access, focus behavior, and reachable actions. Important functionality cannot depend only on hover.

Use the shared Design System. Do not duplicate page-specific Buttons, Inputs, Cards, Dialogs, EmptyState, LoadingState, or ErrorState unless a genuinely different reusable component is required.

## 27. Testing and runtime verification

Add the appropriate combination of:

- unit tests
- service/integration tests
- UI/component tests
- Firebase Emulator Rules tests
- concurrency tests
- real authenticated browser smoke tests

Security invariants require negative tests. Concurrency-sensitive invariants require real concurrency tests where practical. Unit tests alone do not prove runtime integration.

Never run destructive tests against production data.

## 28. Environments and secrets

Keep development/test/production separated. Do not point destructive tests at production Firebase. Never commit or expose private keys, service-account credentials, API secrets, provider keys, or local secret files. Use environment/deployment secret management.

## 29. Feature classification and architecture reuse

Before introducing a substantial concept, classify it as one of:

- Core Capability
- Module Capability
- View / Presentation
- Workflow
- Core Entity
- Domain Entity
- Agent
- Integration
- Entitlement
- Infrastructure

Do not create a new primitive when an existing category fits. Avoid parallel Module registries, Record stores, Permission Engines, Widget systems, Ledgers, identity models, or other competing engines. Extend the canonical architecture or explicitly version/replace it through an architecture decision.

## 30. V1 and Automat

Modulity V1 is reference material only. Every V1 concept must earn migration. Do not automatically copy localStorage business stores, legacy generators, parallel AI paths, IDs, Ledger behavior, or security assumptions.

Future Automat reasoning should follow:

```text
Industry / Organization
→ Business Areas
→ Domain Objects
→ Processes
→ Capabilities
→ Modules
→ Relationships
→ Worksets / Widgets / Reports
```

Automat configures the canonical platform; it does not create a parallel runtime. Industry-specific operational Modules must dominate over generic office templates for specialized organizations.

## 31. Change and milestone discipline

Stay within the requested milestone. Do not start the next roadmap Step because it is convenient. Deferred work is documented, not silently implemented.

Completion reports describe actual implementation. Never say “implemented” for planned, placeholder, mocked, or partially wired behavior.

## 32. Destructive Workspace operations

Workspace/account/module reset and deletion are distinct operations. Destructive Workspace operations require a trusted backend/Admin boundary, verified authorization, an explicit allowlisted resource contract, two-stage confirmation, idempotency, concurrency protection, surviving metadata-only audit evidence, and Workspace-scoped cache invalidation.

Never weaken ordinary immutable-resource Rules or implement React/browser collection-deletion loops for reset convenience. New collections do not automatically join a reset contract. Binary storage cleanup must be handled separately from Firestore metadata.

## 33. Mandatory completion checklist

Before completing any task, verify:

- [ ] Did I preserve canonical data ownership?
- [ ] Did I avoid creating a second source of truth?
- [ ] Did I preserve Module / Form / Record / Entity boundaries?
- [ ] Does this work correctly with multiple Workspaces?
- [ ] Does Personal Workspace still work?
- [ ] Is authorization enforced outside presentation/UI?
- [ ] Could another client use the underlying capability without reimplementing the business rules?
- [ ] Did I avoid putting canonical business logic only inside React?
- [ ] Does the design remain compatible with future Mobile clients?
- [ ] Does the design remain compatible with future WordPress/embedded clients?
- [ ] Are Firestore queries bounded or paginated?
- [ ] Is cache only a performance layer?
- [ ] Are loading, empty, ready, refreshing and error states handled?
- [ ] Are identity and timestamps authoritative where required?
- [ ] Is audit/provenance preserved?
- [ ] Did I preserve Record history?
- [ ] Did I preserve Ledger invariants?
- [ ] Did I preserve previous milestone security invariants?
- [ ] Did I consider responsive/mobile web behavior?
- [ ] Did I add/update appropriate tests?
- [ ] Did I add negative security tests where relevant?
- [ ] Did I avoid introducing secrets?
- [ ] Did I update architecture documentation if contracts changed?
- [ ] Did I remain inside the requested milestone?
- [ ] Did I run the required validation commands?
