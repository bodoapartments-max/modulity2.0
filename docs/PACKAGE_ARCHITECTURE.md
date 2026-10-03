# Modulity 2.0 — Package Architecture

## Status

Proposed target structure. Physical move deferred to Step 11.1.

## 1. Dependency Direction Policy

```text
app/
   ↓ uses
features/
   ↓ uses
engines/   agents/
   ↓ uses
capabilities/
   ↓ uses
core/
   ↓ uses (implements ports of)
infrastructure/
   ↓ uses
platform SDKs (Firebase, etc.)

design-system/  → used by app, features, some engine UI adapters
shared/         → used by everyone; domain-neutral contracts/utilities only
```

Rules:

- `core/` imports only from `core/` and `shared/`.
- `capabilities/` imports only from `core/`, `shared/`, and other `capabilities/` files.
- `engines/<name>/` imports from `capabilities/`, `core/`, `shared/`, and its own subtree.
- `agents/` imports from `core/`, `shared/`, and its own subtree.
- `features/` imports from `engines/`, `agents/`, `capabilities/`, `core/`, `shared/`, and `design-system/`.
- `app/` imports from all of the above plus `design-system/`.
- `infrastructure/` implements repository/storage/identity adapters consumed by `core/` and services consumed by `features/`.
- `design-system/` imports nothing business-related.
- `shared/` imports nothing domain-specific.

## 2. Proposed Final Package Tree

```text
src/
├── app/                         # Shell, routing, global providers
│   ├── providers/
│   ├── router/
│   └── shell/
├── features/                    # User-facing product features
│   ├── auth/
│   ├── calendar/
│   ├── dashboard/
│   ├── entities/
│   ├── ledger/
│   ├── modules/
│   │   └── designer/
│   ├── notifications/
│   ├── organization/
│   ├── people/
│   ├── records/
│   ├── reports/
│   ├── widgets/
│   ├── worksets/
│   ├── chat/
│   ├── automat/
│   └── workspace-reset/
├── engines/                     # Operational Capability Engines
│   └── calendar/
│       ├── domain/
│       ├── runtime/
│       ├── validation/
│       ├── index.js
│       └── ui/                  # optional: engine-specific UI adapters (still under features/calendar for React)
├── capabilities/                # Generic capability infrastructure
│   ├── contracts/
│   ├── registry/
│   ├── definition/
│   └── runtime/
├── agents/                      # Agent infrastructure + concrete agents
│   ├── infrastructure/          # was src/infrastructure/automatPlanning.js
│   ├── contracts/
│   ├── registry/
│   ├── orchestrator/
│   ├── providers/
│   └── planning/
├── core/                        # Canonical business domain
│   ├── data/
│   ├── workspace/
│   ├── ledger/
│   ├── audit/
│   └── events/
├── design-system/               # Reusable UI primitives
├── shared/                      # Domain-neutral contracts and utilities
│   └── contracts/               # repository interfaces, storage contract, etc.
└── infrastructure/              # Platform-specific adapters
    ├── firebase/
    ├── config/
    ├── identity/
    ├── services.js              # wiring only; no import-time side effects
    └── repositories.js
```

## 3. Concrete Package Move Map

| Current Path | Proposed Path | Change Type | Risk | Notes |
|---|---|---|---|---|
| `src/core/capabilities/calendarEngine.js` | `src/engines/calendar/runtime/calendarEngine.js` | MOVE_AND_IMPORT_UPDATE | LOW | Pure JS; update tests + `capabilityRuntime` seam |
| `src/core/capabilities/calendarDefinitionV1.js` | `src/engines/calendar/validation/calendarDefinitionV1.js` | MOVE_AND_IMPORT_UPDATE | LOW | Update `builtInCapabilityCatalog` registration |
| `src/core/capabilities/calendarProjection.js` | `src/engines/calendar/domain/calendarProjection.js` | MOVE_AND_IMPORT_UPDATE | LOW | Update tests |
| `src/core/capabilities/calendarEngine.test.js` | `src/engines/calendar/runtime/calendarEngine.test.js` | MOVE_ONLY | LOW | Co-locate test |
| `src/core/capabilities/calendarDefinitionV1.test.js` | `src/engines/calendar/validation/calendarDefinitionV1.test.js` | MOVE_ONLY | LOW | Co-locate test |
| `src/core/capabilities/capabilityRuntime.js` | `src/capabilities/runtime/capabilityRuntime.js` | MOVE_AND_IMPORT_UPDATE | MEDIUM | Extract hardcoded calendar branch into registered factory map |
| `src/core/capabilities/builtInCapabilityCatalog.js` | `src/capabilities/registry/builtInCapabilityCatalog.js` | MOVE_AND_IMPORT_UPDATE | MEDIUM | Register calendar validator/factory via new seam |
| `src/core/capabilities/capabilityEngineRegistry.js` | `src/capabilities/registry/capabilityEngineRegistry.js` | MOVE_ONLY | LOW | Generic infrastructure |
| `src/core/capabilities/capabilityContracts.js` | `src/capabilities/contracts/capabilityContracts.js` | MOVE_ONLY | LOW | Generic infrastructure |
| `src/core/capabilities/capabilityDefinition.js` | `src/capabilities/definition/capabilityDefinition.js` | MOVE_ONLY | LOW | Generic infrastructure |
| `src/core/capabilities/capabilityDefinitionRepository.js` | `src/capabilities/definition/capabilityDefinitionRepository.js` | MOVE_ONLY | LOW | Generic infrastructure |
| `src/core/capabilities/capabilityDefinitionService.js` | `src/capabilities/definition/capabilityDefinitionService.js` | MOVE_ONLY | LOW | Generic infrastructure |
| `src/core/analytics/*` | `src/engines/analytics/*` (or keep in core) | EVALUATE | LOW | If treated as read-capability engine, move; if treated as core report engine, keep |
| `src/core/data/entityPresentation.js` | `src/shared/presentation/entityPresentation.js` or `src/modules/forms/` | MOVE_AND_IMPORT_UPDATE | LOW | Presentation helper, not domain |
| `src/core/data/recordListPresentation.js` | `src/shared/presentation/recordListPresentation.js` or `src/modules/forms/` | MOVE_AND_IMPORT_UPDATE | LOW | Presentation helper |
| `src/modules/forms/fields/EntityReferenceField.jsx` | `src/design-system/components/EntityReferenceField/` or `src/modules/forms/fields/` with injected loader | SMALL_BOUNDARY_EXTRACTION | MEDIUM | Remove direct `services` import; pass `listEntities` callback |
| `src/features/widgets/ui/WidgetCard.jsx` | `src/design-system/components/WidgetCard/` | MOVE_AND_IMPORT_UPDATE | LOW | Reusable across dashboard and widgets |
| `src/infrastructure/automatPlanning.js` | `src/agents/infrastructure/automatPlanning.js` | MOVE_AND_IMPORT_UPDATE | MEDIUM | Removes infrastructure→agents import direction violation; relocate dev entitlement resolver |
| `src/app/shell/AppShell.jsx` route table | Per-feature route modules (e.g., `src/features/calendar/routes.jsx`) | MOVE_AND_IMPORT_UPDATE | LOW | Reduces AppShell size; keep lazy loading |
| `src/app/shell/Header.jsx` workset selector | Extract to `src/design-system/components/WorksetSelector/` | SMALL_BOUNDARY_EXTRACTION | LOW | Deduplicate with Sidebar |
| `src/core/events/eventBus.js` | Keep in `core/events/` but inject via bootstrap | SMALL_BOUNDARY_EXTRACTION | LOW | Remove global singleton usage where practical |
| `functions/scripts/build-shared.mjs` copied files | `src/shared/contracts/` source of truth | MOVE_AND_IMPORT_UPDATE | MEDIUM | Single copy source; update build-shared list or replace with workspace dep |

## 4. Files That Should Stay Where They Are

| Path | Reason |
|---|---|
| `src/core/data/*` models and services | Canonical domain |
| `src/core/workspace/*` | Identity/workspace/membership domain |
| `src/core/ledger/*`, `src/core/audit/*` | Core engines (not optional Capability Engines) |
| `src/modules/module.js`, `moduleService.js`, `moduleSubmissionService.js` | Module runtime is a Core-like definition engine |
| `src/modules/forms/formSchemaValidator.js`, `fieldRegistry.js`, `FormRenderer.jsx` | Form rendering belongs to Module runtime surface |
| `src/infrastructure/services.js` (after side-effect cleanup) | Wiring root |
| `src/infrastructure/firebase/*` repository implementations | Platform adapters |

## 5. Public API Boundaries

Proposed stable entry points:

| Package | Public API File | Exports |
|---|---|---|
| `capabilities` | `src/capabilities/index.js` | `CapabilityEngineRegistry`, `CapabilityDefinition`, `validateDefinition`, `createSourceRef`, `CapabilityBinding` |
| `engines/calendar` | `src/engines/calendar/index.js` | `createCalendarEngine`, `validateCalendarDefinitionV1`, `CalendarEventProjection` |
| `core` | `src/core/index.js` (optional barrel) | `entityType`, `record`, `module`, `entityService`, `recordService`, `moduleService`, etc. |
| `agents` | `src/agents/index.js` | `agentRegistry`, `agentOrchestrator`, `systemPlanningOrchestrator`, `workspaceArchitect` |
| `design-system` | `src/design-system/index.js` | all primitives |
| `shared` | `src/shared/index.js` | repository contracts, storage contract, presentation helpers |

Avoid deep imports into another package's internals.

## 6. Step 11.1 Migration Order

1. **Design-System extraction** — move `WidgetCard`, extract `WorksetSelector`, no runtime behavior change.
2. **Capability engine seam** — add `engineFactories`/`validators` registration map in `capabilityRuntime.js` and `builtInCapabilityCatalog.js`.
3. **Move Calendar runtime** — move `calendarEngine.js`, `calendarDefinitionV1.js`, `calendarProjection.js` and tests into `src/engines/calendar/`; update registrations.
4. **Move generic capability infrastructure** — move `capabilityRuntime.js`, `capabilityEngineRegistry.js`, `capabilityContracts.js`, `capabilityDefinition*.js` into `src/capabilities/`.
5. **Move `automatPlanning.js`** — relocate to `src/agents/infrastructure/`; update imports.
6. **Move presentation helpers** — move `entityPresentation.js`/`recordListPresentation.js` to `src/shared/presentation/` or `src/modules/forms/`.
7. **Core/analytics decision** — decide whether analytics stays in Core or moves to `engines/analytics/`.
8. **AppShell route split** — move per-feature lazy route declarations into feature route files.
9. **Services.js side-effect cleanup** — move bridge startup into explicit `bootstrap()` called by `App.jsx`.
10. **Functions `build-shared.mjs` update** — adjust copied-file paths if any moved.
11. **Final boundary grep** — verify no `core/` imports from `features/`, `engines/`, etc.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Moving tests breaks import paths | Co-locate tests with moved files; run full `npm test` after each commit |
| Functions `build-shared.mjs` copy list goes stale | Update script immediately in same commit; add CI check that `npm run test:rules` still passes |
| Lazy route imports break code splitting | Preserve `React.lazy` and route paths; only move declarations |
| Calendar engine registration breaks UI | Update `services.js` wiring and `useCalendar.js` in same change set |
| Side-effect removal breaks bridges | Add explicit `bootstrap()` call in `App.jsx`; test notification/audit paths |
| Shared barrel exports create cycles | Keep barrels thin; prefer direct public package imports |

## 8. Repository Strategy

One Git repository. Package boundaries are directory conventions, not separate packages or npm workspaces, unless future scale justifies it. The `functions/` deployment continues to copy shared contracts via `build-shared.mjs` until a real shared package/workspace is introduced.
