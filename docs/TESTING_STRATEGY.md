# Modulity 2.0 — Testing Strategy

This document defines how Modulity 2.0 is tested at every layer.

---

## 1. Goals

- Catch regressions in the Core before they reach the UI.
- Verify subsystem contracts are honored by both producers and consumers.
- Ensure permission checks are correct.
- Ensure the platform works without agents.
- Keep tests fast enough for frequent feedback.

---

## 2. Test Pyramid

### Unit Tests

- Test pure functions, utilities, validators, hooks, model functions.
- Use Vitest.
- Location: next to the source file (`foo.test.js`, `useFoo.test.js`).
- Mock external dependencies (Firebase, LLM providers, billing API).

### Integration Tests

- Test subsystem interactions across documented contracts.
- Examples:
  - Module Runtime + Records + Ledger
  - Permissions + Membership + Entitlements
  - Event bus + Notifications + Audit
- Use a test database / emulator where possible.
- Validate boundary behavior.

### Contract Tests

- Verify module manifests conform to the Module Contract.
- Verify agent input/output contracts.
- Verify event envelope schemas.
- These tests run against fixtures and real module/agent registrations.

### End-to-End Tests

- Test critical user flows.
- Examples:
  - Register → create workspace → create module → create record
  - Assign record → submit → approve
  - Share record via secure link
- Use Playwright.
- Run against a staging-like environment.

---

## 3. What Must Be Tested

| Area            | Test Focus                                              |
| --------------- | ------------------------------------------------------- |
| Identity        | Registration, login, token refresh, service identities  |
| Workspace/Org   | Creation, isolation, settings                           |
| Membership      | Invite flow, roles, groups, status transitions          |
| Permissions     | Role checks, module access, record ownership, sharing   |
| Entities        | CRUD, soft-delete, relationships                        |
| Records         | Lifecycle transitions, validation, projection views     |
| Ledger          | Sequence allocation, book closing, cancellation display |
| Events          | Event emission, routing, idempotency                    |
| Module Runtime  | Manifest validation, form rendering, lifecycle graph    |
| Forms           | Field validation, schema-driven rendering               |
| Widgets/Reports | Configuration-driven outputs                            |
| Billing         | Entitlement resolution, usage counters, plan limits     |
| Agents          | Contract validation, no bypass, timeout behavior        |

---

## 4. Test Data & Fixtures

- Use factory functions for test data.
- Keep fixtures close to the subsystem they test.
- Never use production credentials or real secrets.
- Reset state between tests to avoid cross-test leakage.

---

## 5. CI/CD

- Run lint on every PR.
- Run unit and contract tests on every PR.
- Run integration tests on every PR.
- Run E2E tests before merging to main or on a schedule.
- Block merges on test failures.

---

## 6. Quality Metrics

- Aim for high coverage on Core subsystems.
- Coverage is a guardrail, not a goal.
- Prioritize correctness of permission checks, lifecycle transitions and ledger sequences.

---

## 7. Manual Testing

- Complex UI flows and responsive breakpoints are validated manually where automated tests are brittle.
- Exploratory testing is performed before each milestone.
