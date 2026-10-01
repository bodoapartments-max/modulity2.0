# Modulity 2.0 — Roadmap

This document lists the planned development milestones. Steps 1–9 are intentionally out of scope for Step 0.

---

## Step 0 — Architecture Blueprint & Project Constitution

**Status:** In progress

- Define architecture, boundaries, dependency direction
- Define data model, module contract, agent contract, event contract
- Define security, billing, design, performance and testing strategies
- Create minimal project scaffolding
- Do NOT implement application features
- Do NOT migrate Modulity V1

---

## Step 1 — Foundation

- Initialize project toolchain (Vite, React, Tailwind, ESLint, Prettier)
- Set up design-system tokens and base components
- Set up infrastructure abstractions (config, persistence adapter interfaces)
- Set up identity and authentication adapter
- Set up CI lint/test skeleton
- Hello-world app shell with routing placeholder

---

## Step 2 — Workspace & People

- User registration / login / profile
- Personal workspace
- Organization (workspace) creation and settings
- Membership invitations, roles, groups
- Basic permission system
- Organization switcher / context

---

## Step 3 — Universal Data Core

- Core Entity and Domain Entity definitions
- Entity instances (create, read, update, soft-delete)
- Relationship engine
- Assignment engine
- File attachments metadata
- Search foundation

---

## Step 4 — Module Engine

- Module registry
- Module manifest validation
- Module Runtime
- Schema-driven form renderer with reusable field components
- Module installation / activation per workspace
- Basic module builder UI

---

## Step 5 — Record & Collaboration Engine

- Canonical Record model
- Record creation from module forms
- Record lifecycle transitions
- Assignment and recipient model
- Sharing (user, member, group, email, secure link, QR)
- Record permissions and access control

---

## Step 6 — Ledger & Audit Engine

- Ledger books and sequences
- Reference number allocation
- Cross-out / cancellation display
- Audit event logging
- Ledger view
- Audit trail view

---

## Step 7 — Workspace Experience

- Reusable Record List Engine (module and global)
- Table view
- Folders and favorites
- Filters and saved views
- Notifications UI
- Mobile-first responsive layouts
- Chat foundation

---

## Step 8 — Reports & Intelligence

- Widget engine
- Report definition model
- Cross-module reports
- Basic dashboard
- Agent registry and first specialist agents
- Agent orchestrator (optional recommendations only)

---

## Step 9 — Automat System Builder

- Automation rule engine
- Trigger / action model
- Visual automation builder
- Integration webhooks
- External API tokens and service identities
- External agent support

---

## Notes

- Steps may be split or reordered based on validated learning.
- Each step must leave the codebase cleaner and the architecture intact.
- No V1 migration unless explicitly planned as a separate milestone.
