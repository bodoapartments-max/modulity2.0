# Modulity 2.0 — Project Constitution

This document defines the non-negotiable principles that every future design decision, subsystem, and line of code in Modulity 2.0 must respect.

---

## 1. Purpose

Modulity is a **modular operations platform**. It allows an individual or organization (company, school, hotel, theatre, non-profit, etc.) to build its own operational system from:

- Modules
- Forms
- Records
- Entities and Domain Entities
- Relationships and Assignments
- Files, Workflows, Lists, Tables
- Ledger / Audit
- Widgets, Reports, Notifications
- Sharing, Worksets, Automation
- Optional intelligent agents

The same Modulity Core must support all of them without hard-coding industry-specific concepts into the platform.

---

## 2. First Principles

### 2.1 The Record is the canonical operational object

A Module defines how Records are created, validated, displayed and used, but the Record itself is the central object.

The same Record may appear in:

- Module ListView
- Global ListView
- Table View
- Ledger
- Widgets
- Reports
- Search
- Entity history
- Notifications

**There must be one canonical source of truth for a Record.** Do not duplicate Records for different views.

### 2.2 Core works without agents

The entire essential platform must function with every intelligent/LLM agent disabled.

Agents are **optional** intelligence layers. They enhance configuration, recommendations and assistance. They must never become the Core business logic, nor bypass security, permissions, schema validation or ledger rules.

### 2.3 Modular and replaceable

Every major subsystem must be bounded by a documented contract. Prefer:

- small services
- clear interfaces
- versioned contracts
- dependency boundaries
- testable modules

over tightly coupled implementation.

A subsystem must be replaceable without rewriting unrelated parts of Modulity.

### 2.4 API-first Core

Web UI, mobile clients, internal agents, external agents and integrations all consume the same Core through authenticated APIs.

External agents must not directly manipulate trusted database state. They must use authenticated application APIs with:

- API tokens / service identities
- scoped permissions
- rate limits
- idempotency keys
- webhooks / events
- audit attribution

### 2.5 Organization isolation

Data must never leak across organizations. Authorization decisions are server-authoritative. Hiding UI is not security.

### 2.6 One canonical model

When uncertain, prefer:

- one canonical model
- one documented contract
- one reusable engine
- one source of truth

over duplicated specialized implementations.

---

## 3. Migration from Modulity V1

- This is a clean rebuild.
- Nothing from Modulity V1 is imported unless explicitly reviewed and approved in a future step.
- V1 may be referenced for context only when requested.
- Migration is a deliberate engineering activity, not a copy operation.

---

## 4. Rules for Future Development

1. A future coding agent must be able to locate the canonical place for:
   - Record creation
   - Module registration
   - Permission checking
   - Ledger writing
   - Entity creation
   - Agent contracts
   - Billing entitlements
     without searching through unrelated UI code.
2. Every public contract must be documented.
3. No business logic in presentational components.
4. No permissions logic in React component props or conditional rendering alone.
5. No hardcoded secrets, prices or environment-specific values in source files.
6. No module-specific CSS unless genuinely unavoidable.
7. Every reusable component must live in `src/design-system/`.
8. Every feature must separate UI (`ui/`) from logic (`model.js`).
9. Data fetching belongs in `/model.js`, not in UI files.
10. Prefer explicit architecture over clever abstractions.

---

## 5. What This Project Is Not

- Not a monolithic ERP with every business object hard-coded.
- Not a low-code app generator that emits unique components for every form.
- Not an agent-dependent system.
- Not a prototype optimized for speed over correctness.
