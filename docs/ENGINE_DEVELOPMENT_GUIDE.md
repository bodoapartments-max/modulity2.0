# Engine Development Guide (Step 20 contract)

> **Step 20 documents, does not implement.** Any future capability (Events, Rules, Policy, Inventory, Files, Procurement, etc.) must satisfy this contract to be considered an Engine.

## Identity

| Field | Description |
|---|---|
| `engineId` | Stable identifier (UPPER_SNAKE); immutable after first release |
| `version` | Engine version — back-compat guaranteed within the same major |
| `displayName` | Human label — free to evolve |
| `owner` | `MODULITY_CORE` or published module |
| `lifecycleStatus` | `DRAFT → PUBLISHED → DEPRECATED → RETIRED` |

## Responsibility contract

One Engine = one responsibility. An Engine owns its domain case-generation, NOT canonical business data. The canonical Record (or its declared descendants) are outcomes of the Engine, never primary residency.

## Dependencies

An engine declares **Requires:** explicit runtime dependencies. If a key dependency is missing, the capability contract must return `MISSING_DEPENDENCY` — Engines do NOT invent business data, do not bridge paths in Core, and must not bypass canonical models directly.

## Canonical interfaces

- **Inputs:** declarative payload (type-safe, contract versioned). No arbitrary Firebase queries. No "meet your contract every time" by assumption.
- **Outputs:** stable typed values to feed the next engine/report.
- **Trusted actions:** named write-boundary handlers.
- **Permissions:** delegated to capability lists — never embedded in runtime.

## Forbidden patterns

- Browser Firestore writes by default (via trusted commands only)
- Sensitive secrets or API keys held in the engine
- Double identity models (User/Person/Employee etc.)
- Own permission system, own Audit, own Notification
- Canonical localStorage
- Hardcoded workspace/ids into domain code
- React runs business logic
- LLM call must be required for normal runtime behavior
- Darkest writes "smooth ingest" — audits go through the trusted Notification boundary

## Reset semantics

Every Engine must expose explicit `reset(workspaceId)` behavior. Workspace_Reset walks canonical base-state resources only (never auth/auth-profile/membership). An Engine whose storage violates this provides a BAD test candidate.

## Tests

Prove:

1. successful nominal execution;
2. input validation;
3. idempotent retry;
4. operation timeline compliance;

plus the tightest boundary: one Gate test per Engine (deny public access when it shouldn't have); one Integration/E2E test exercising the engine's highest requirement.

> **First reference implementation target:** Business Event Backbone (Step 22), which will prove the contract, not just copy documents.
