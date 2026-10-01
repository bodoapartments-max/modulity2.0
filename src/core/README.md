# Core Subsystems

This folder contains the canonical business logic subsystems of Modulity 2.0.

Each subsystem exposes a documented public contract through its `index.js`.

## Subsystems

- `identity` — user accounts, authentication, service identities
- `workspace` — organizations / workspaces
- `membership` — user ↔ organization memberships
- `entities` — core and domain entity definitions and instances
- `records` — canonical records and lifecycle transitions
- `relationships` — links between records and entities
- `permissions` — centralized authorization
- `assignments` — record and entity assignments
- `ledger` — durable ledger books, sequences and audit history
- `events` — event bus and event contracts
- `files` — file attachment metadata and storage adapters
- `entitlements` — billing-derived capability resolution

## Dependency Rules

- Core subsystems may depend on `infrastructure/` abstractions.
- Core subsystems may depend on each other through documented contracts.
- Core subsystems must never depend on `features/`, `modules/`, `app/` or `agents/`.
