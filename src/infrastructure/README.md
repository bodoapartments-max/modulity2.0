# Infrastructure

This folder contains infrastructure adapters and configuration for Modulity 2.0.

## Subsystems

- `firebase` — Firebase-specific adapters (auth, Firestore, Storage, Functions)
- `persistence` — persistence abstractions and query helpers
- `config` — environment-based configuration

## Principles

- Infrastructure is the bottom layer of the dependency graph.
- Core subsystems depend on infrastructure abstractions, not concrete providers.
- Provider-specific code is isolated so it can be replaced.
- Configuration is loaded from environment variables and validated at startup.
