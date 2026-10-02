# Agents

This folder contains the optional intelligent agent layer of Modulity 2.0.

## Subsystems

- `contracts` — strict versioned Agent definitions and execution envelopes
- `registry` — Agent registration, version/status resolution, and entitlement boundary
- `orchestrator` — input/output validation, adapter invocation, timeout/error normalization, and provenance
- `providers` — replaceable provider contract plus deterministic test adapter
- `automat` — BuildPlan/snapshot/analyzer contracts, references, fixtures, classification, and deterministic validation

Step 9.0 is domain-only. It has no Firestore repository or canonical apply operation. See `docs/AUTOMAT_ARCHITECTURE.md`.

## Core Rules

- Agents are optional. The platform works with all agents disabled.
- Agents never bypass authentication, authorization, permissions, entitlements, schema validation or ledger rules.
- Agents never directly manipulate trusted database state.
- Agent outputs that affect configuration or records are validated by Core services before persistence.
- Changing the model/provider behind an agent must not require rewriting Core.
