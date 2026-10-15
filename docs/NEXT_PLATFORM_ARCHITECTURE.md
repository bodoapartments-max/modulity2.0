# Next Platform Architecture — Step 20

> **The principle:** MODULITY IS AGENT-BUILT, HUMAN-CONTROLLED, AND DETERMINISTICALLY OPERATED.
> Agents BUILD and EVOLVE the machine. The machine RUNS the business.
> **Deterministic behavior never requires an LLM call.**

## 1. Application ≠ Platform

Modulity is BOTH an application AND a platform. The React web client is one client among several.

```
CLIENT (Web / Mobile / WordPress / Embedded / External app / Partner / Agent / AI agent)
    ↓
APPLICATION / PLATFORM BOUNDARY
    ↓
AUTHENTICATION / IDENTITY / ENTITLEMENT
    ↓
PERMISSION (may I do this at all?)
    ↓
POLICY / AUTHORITY (may I do it under THESE conditions?)
    ↓
TRUSTED COMMAND
    ↓
DOMAIN / CORE ENGINE
    ↓
REPOSITORY / TRUSTED BACKEND
```

No client may bypass the Trusted Core. No distinct business logic ever lives inside the React client.

## 2. Platform Gateway (decided boundary, not yet built)

**Decision:** Modulity will expose a trusted Platform Gateway step (future Step 28). Third-party callers and authorized Agents reach the same canonical capability surface; they do NOT reach permanent state writes. The Gateway is:

- scoped API tokens / service identities (sync and async via webhooks);
- MCP tool surface when it reaches stable semantics;
- embed/host-surfaces (including WordPress) for trusted UI.

NEVER: direct database access from WordPress, external apps, agents, integrations.

## 3. WordPress compatibility (permanent)

WordPress is a client of the boundary; it does not become another backend. WordPress-specific flows (blocks, plugin surfaces, embed, checkout overhead) go through connectors that the User is allowed to operate — they are strictly bounded by capability contracts handed to the Platform Gateway.

## 4. Business Event Backbone (future)

**Goal:** replace point-to-point inter-engine coupling with deterministic, idempotent canonical events.

```
BUSINESS CHANGE
  ↓
CANONICAL BUSINESS EVENT  (type, version, workspace, source, actor, objectReference, timestamp, payload, idempotencyKey, correlationId)
  ↓
EVENT BACKBONE
  ↓
interested deterministic capabilities
```

**The three hard splits:**

- EVENT ≠ AUDIT ENTRY (into no business evidence)
- EVENT ≠ LEDGER ENTRY (it is transformation/derivation, not registration proof)
- EVENT ≠ NOTIFICATION (user-facing messaging does not substitute for business evidence)

Events are first-class canonical data — durable, idempotent, versionable.

## 5. Rules / Decision Engine (future)

**[Rules Architecture](docs/… is planned at Step 23)**

**Decision structure now (Step 20):** evaluation vs mutation separation is documented. `RuleDefinition` is versioned; deterministic evaluate → recommended transition intents; Policy gate decides to auto-publish or route for approval. Loop prevention and idempotency (event-driven, operation-safe) are continuous. Agents may translate natural language TO proposed rules; they do NOT execute them.

## 6. Permission ≠ Policy / Authority

PERMISSION asks: **May this actor perform this capability at all?**

POLICY / AUTHORITY asks: **Under THESE conditions, may it execute?**

Outcomes:

AUTO EXECUTE
APPROVAL REQUIRED
DENY

Hardcoded approval is **not** mandatory architecture. Auto execution remains a default so routine flows stay efficient.

### Authority actors (dimensioned)

| WHO | WHAT | WHERE | UNDER WHICH CONDITIONS | WHICH LIMITS |
|---|---|---|---|---|
| User | approve purchases | site/department | working hours | amount below €5,000 |
| Role | adjust inventory minimum | store | Mon–Fri | ±10% across book |
| Membership | run ledger entries | organization | direct contribution entitlements | capacity constraints |
| Agent | build modules | workspace | approval required | no write bypass |
| Service | rotate credentials | infrastructure path | always append-only | rotate by policy only |
| Integration | ingest messages via webhooks | external front-end | secret rotation window | bounded retry bundle |
| Engine | apply rules | suite of them | its own contract | explicit autonomy |

### Temporal authority

Generic fields on grants: `validFrom`, `validUntil`, `scope`, `limits`, `conditions`, `fallbackPolicy`. When validity expires, the authority **automatically ceases** and the fallback takes over — no admin intervention needed.

UX principle: simple by default, powerful on demand. Time bounds are ADVANCED options, NOT required fields.

## 7. Configuration Lifecycle (future)

DRAFT → VALIDATE → TEST/SIMULATE → POLICY CHECK → AUTO PUBLISH | APPROVAL REQUIRED | DENY → PUBLISHED → VERSIONED ACTIVE

supports rollback.**

Appropriate targets: RuleDefinition, AgentDefinition, connector mappings, module operational definitions, policy definitions, runtime keys.

## 8. Simulation / Dry-Run (future)

**Semantics:**

- Run simulations BEFORE production mutation.
- Once simulation becomes an accepted forecast, publish only after Policy acceptance.
- Simulate uses the same canonical definitions and data the engine would use — no "fake business engine" allowed.

SIMULATION ≠ PRODUCTION EXECUTION. Its results are not statements of fact about canonical state.

## 9. Secrets / Credential Vault (future)

Before Integration Platform (Step 28) ships, a trusted Vault handles:

- encrypted storage, rotation, expiration, revocation, access control, audit trace.

Agents/Users never receive raw credential material UNLESS absolutely required by a Trusted Administration flow. The Platform exposes only CONNECTED / EXPIRED / NEEDS_REAUTH / CAPABILITIES.

## 10. Observability / Operations Center (future)

**What it is:** engine/rule/connector/agent health; failed operations; pending approvals; retry queues.
**It is NOT:**

- Audit (who did what and when),
- Notification (user-facing communication),
- Ledger (business evidence).

Action Inbox ("What needs my attention?") projects across the surfaces when sources exist; the inbox DOES NOT second-guess the underlying capabilities.

## 11. Location / Site (designed in Step 20; enabler next)

**Decision:** a Site/Location is a **domain-owned contextual concept**, not a generic Core Entity Type — the Core already owns the Location core Entity Type and areas of operations grow composably (Sites build dynamically on modules, definitions, and modules-owned fields). Different engines may later model multi-site multitenancy by referencing the same stable `Location` entity; they must not invent their own `locationId` primitives. If multi-site scenarios ever require first-class hierarchy (Region → RegionItem → Site → Department), it must grow via canonical relations, not replace Location models.

## 12. Units / Measurements / Money (architecture, not library)

Canonical shared semantics needed:

- **Quantity**: value + unit (e.g. `5 kg`).
- **Money**: amount + currency (e.g. `124.50 EUR`).

Units/currencies accept closed murmurations (`kg/g/l/ml/piece/case/pallet`, `EUR/GBP/USD`, etc.). Conversions where valid are deterministic (1 kg = 1000 g); packing-unit conversion is never assumed until the Route-Package Model defines it.

No inventory package ships this processing today — measurable semantics for future Inventory/BOM/Procurement depend on it.

## 13. Data Portability

A customer's business data is never held hostage by Modulity. Future workspace export covers, subject to permission/compliance constraints: Entities, Records, Files, Ledger, Audit, Modules, relationships, and relevant configuration — in machine-readable formats.

Export v1: any human-readable and JSON-serializable surfaces tested for correctness. Raw live system secrets (tokens/API keys) are never part of an export.
