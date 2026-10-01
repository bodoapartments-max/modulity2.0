# Integrations

This folder contains the external-facing integration layer of Modulity 2.0.

## Subsystems

- `api` — public API surface for external agents and partners
- `webhooks` — outbound webhook delivery of events
- `billing` — billing provider adapters and subscription synchronization

## Principles

- External consumers must authenticate and use the API surface.
- No direct database access for external agents.
- All integration endpoints delegate authorization and validation to Core services.
- Webhooks are event-driven and idempotent where applicable.
