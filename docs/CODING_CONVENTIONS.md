# Modulity 2.0 — Coding Conventions

This document defines the conventions all contributors and coding agents must follow.

---

## 1. File & Folder Structure

```
src/
  app/              # App shell, routing, providers
  core/             # Core business logic subsystems
  modules/          # Module contracts, registry, runtime, forms, views
  agents/           # Agent contracts, registry, orchestrator, providers
  features/         # User-facing feature modules (ui/ + model.js)
  integrations/     # API, webhooks, billing adapters
  design-system/    # Reusable UI primitives and tokens
  infrastructure/   # Firebase, persistence, config
```

## 2. Naming Conventions

- Components: `PascalCase.jsx`, one component per file, default export.
- Hooks: `useCamelCase.js` inside `/hooks/`, must start with `use`.
- Utilities / models: `camelCase.js`.
- Constants: `SCREAMING_SNAKE_CASE` or `camelCase` for config objects.
- Feature logic file: `model.js`.
- Feature UI folder: `ui/`.
- Subsystem index: `index.js` exporting public API.

## 3. Component Conventions

- Keep components small and focused.
- Separate UI from logic. Logic goes in hooks or `model.js`.
- Use design-system components and Tailwind tokens; avoid hardcoded values.
- Avoid `dangerouslySetInnerHTML` unless content is sanitized.
- Include accessibility attributes (`aria-label`, `alt`, keyboard handlers).

## 4. Hook Conventions

- Custom hooks live in `/hooks/` or feature `model.js`.
- A hook must start with `use`.
- Extract business logic into hooks whenever possible.
- Keep hooks focused on a single concern.

## 5. State Management

- Local state: `useState` / `useReducer`.
- Shared/global state: Zustand or Context.
- Server state: `/model.js` functions, not directly in UI.
- No business logic in components.

## 6. Data Fetching

- Data fetching logic goes in `features/<feature>/model.js`.
- UI calls model functions via hooks.
- Prefer async/await.
- Handle loading and error states explicitly.

## 7. Design Tokens

- Use Tailwind utilities and custom design tokens.
- No hardcoded colors, spacing, font sizes, or breakpoints in JSX/CSS.
- Tokens live in `src/design-system/tokens.js` and `tailwind.config.js`.

## 8. Security

- Never hardcode secrets.
- Never trust client input for security decisions.
- Sanitize user input and rich text.
- Keep permission checks server-side.

## 9. Error Handling

- Handle errors at appropriate boundaries.
- Avoid excessive try/catch noise.
- Surface user-facing errors through UI states (ErrorState, Toast).
- Log errors without exposing secrets.

## 10. Testing

- Unit tests live next to what they test (`Component.test.jsx`, `useHook.test.js`).
- Test logic, not implementation details.
- Integration tests for subsystem contracts.
- E2E tests for critical user flows.

## 11. Comments & Documentation

- Use JSDoc for public functions, hooks and components.
- Explain _why_, not _how_.
- Update architecture docs when structure changes.
- Keep comments current; remove obsolete ones.

## 12. Git Workflow

- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.
- One logical purpose per PR.
- Update `CHANGELOG.md` for user-facing changes.
- PRs must pass lint and tests.

## 13. Code Quality

- No unused code or logs in production.
- Avoid circular dependencies.
- Avoid huge files; split when a file exceeds ~300 lines of logic.
- Prefer explicit code over clever abstractions.
