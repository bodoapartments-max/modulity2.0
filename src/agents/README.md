# Agents

This folder contains the optional intelligent agent layer of Modulity 2.0.

## Subsystems

- `contracts` — Agent contract definitions (input/output, capabilities, validation)
- `registry` — Agent registration and entitlement checks
- `orchestrator` — Coordination of specialist agents
- `providers` — Provider adapters for LLM/external agent APIs

## Core Rules

- Agents are optional. The platform works with all agents disabled.
- Agents never bypass authentication, authorization, permissions, entitlements, schema validation or ledger rules.
- Agents never directly manipulate trusted database state.
- Agent outputs that affect configuration or records are validated by Core services before persistence.
- Changing the model/provider behind an agent must not require rewriting Core.
