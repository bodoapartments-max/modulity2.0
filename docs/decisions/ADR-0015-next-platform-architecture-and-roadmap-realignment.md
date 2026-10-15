# ADR-0015 — Next Platform Architecture & Roadmap Realignment

## Status

Accepted — Step 20 (this milestone).

## Context

Steps 0–19 completed the verified core application. The next capability families (Rules, Event Backbone, Agents, Integrations, Files, Inventory/Procurement, Data Import, Platform Gateway) have strong mutual dependencies that were previously only documented loosely. The closure of Steps 17.4–19 identifies architecture boundaries already locked for future capacity.

## Decision

Modulity is BOTH an application and a platform. The 21+ roadmap is dependency-driven, not numeric-locked. Historical Steps 0–19 are immutable.

### Central principle

**AGENTS build and evolve the machine. The machine runs the business.**

Normal business operation does not depend on an LLM call. Agents are for:

- BUILD
- CHANGE
- CONFIGURE
- ANALYZE
- OPTIMIZE
- INTEGRATE
- ASSIST

Deterministic behavior is Engine-driven.

### Foundations in order

See [`docs/NEXT_PLATFORM_ARCHITECTURE.md`](NEXT_PLATFORM_ARCHITECTURE.md) for full text of the next platform foundation.

### Platform Gateway

The trusted boundary will be expressed by a future **Platform Gateway** (Step 28). WordPress/embedded/partner/agent clients use it through scoped API tokens/MCP — no direct-state access ever.

### Future Engines

**First Engine reference implementation candidate:** Business Event Backbone (Step 22) — already canonical after this Step and MANDATORY for Policies, Rules, and downstream Inventory/Procurement automatic flows.
**Engine contracts:** defined in [`docs/ENGINE_DEVELOPMENT_GUIDE.md`](ENGINE_DEVELOPMENT_GUIDE.md).

### Consequences

- Agents cannot write canonical business state; only Trusted Core can.
- Communication rooms, historically finished chat modules, and personal module setups are blocks to reuse, not patterns to reimplement.
- Speculative AI features acknowledge the deterministic-command foundation already exists and simply REPLACE or EXTEND it.
- "Step 20" is attributed as architecture documentation + zero code.
