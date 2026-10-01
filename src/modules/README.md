# Modules

This folder contains the Module Engine of Modulity 2.0.

Modules are described by a versioned Module Contract and executed by the Module Runtime.

## Subsystems

- `contracts` — Module Contract definitions, schemas and validators
- `registry` — module registration and discovery per workspace
- `runtime` — module execution: form rendering, lifecycle transitions, validation
- `forms` — schema-driven reusable form field components and renderer
- `views` — reusable view engines (ListView, TableView, DetailView, LedgerView)

## Principles

- Modules are configuration, not unique compiled code per module.
- The form renderer uses reusable field components from `forms/`.
- Views are projections of canonical Record data in `core/records`.
- The runtime delegates persistence and authorization to Core services.
