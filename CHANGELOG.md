# Changelog

All notable changes to Modulity 2.0 will be documented in this file.

## [Unreleased]

### Added

- Step 0: Architecture Blueprint & Project Constitution.
  - Created architecture documentation in `docs/`.
  - Created minimal project scaffolding: Vite + React + Tailwind CSS + ESLint + Prettier + Vitest + Playwright.
  - Defined design system tokens and project structure.
- Step 1: Application Foundation.
  - Centralized configuration loader in `src/infrastructure/config/`.
  - Provider-independent identity contract and Firebase Auth adapter.
  - User model boundary mapping Firebase User to `UserIdentity`.
  - Auth Provider, protected/guest routes, login and registration pages.
  - Responsive authenticated shell with header, sidebar, and mobile drawer.
  - First Design System components: Button, IconButton, Input, PasswordInput, Label, Card, Badge, Alert, Dialog, Drawer, Dropdown, Spinner, LoadingState, ErrorState, EmptyState, PageContainer, PageHeader.
  - Application error model translating provider errors to user-safe messages.
  - Unit tests for configuration, identity mapping, auth state, protected routes, form validation, and Design System primitives.
  - GitHub Actions CI workflow running install, lint, test, and build.

- Step 2: Workspace & People Foundation.
  - Core domain models: Workspace, Organization, Membership, Role, Person/Profile, Group, Invitation.
  - Repository contract pattern: contracts in `core/workspace/`, Firestore implementations in `infrastructure/firebase/`.
  - Application services: WorkspaceService, OrganizationService, MembershipService, GroupService (React-independent).
  - Event bus foundation (`core/events/eventBus.js`) with event envelope schema.
  - WorkspaceProvider/Context with workspace switching, localStorage persistence, and access verification.
  - Personal Workspace auto-creation on first login (idempotent).
  - Organization creation flow: creates org + workspace + OWNER membership as one logical operation.
  - Role/capability authorization boundary with OWNER, ADMIN, MEMBER system roles.
  - Owner safety invariant: organization cannot end up with zero owners.
  - Workspace Switcher in header with "Create Organization" action.
  - Workspace-aware sidebar: organization nav items (People, Groups, Settings) only shown for organization workspaces.
  - Dashboard page showing current workspace and user info.
  - Create Organization page with validated form.
  - Organization Settings page with view/edit capability.
  - People page showing organization members with name, email, role, status.
  - Groups page with create/delete functionality.
  - Firestore integration via `firebase/firestore` with emulator support.
  - Firestore Security Rules in `firestore.rules`.
  - Route-level lazy loading for feature pages.
  - Platform events emitted for workspace/organization/membership/group operations.
  - `docs/WORKSPACE_MODEL.md` explaining workspace, membership, and people concepts.
  - 107 unit tests across 21 test files (61 new tests for Step 2).

### Notes

- No Modulity V1 code imported.
- Module Engine, Records, Entities, Ledger, Widgets, Reports, Chat, Notifications, Agents, Billing checkout, External API are intentionally not implemented in Step 2.
- Invitation domain contract is defined; server-side acceptance requires Cloud Functions (documented, not implemented).
- Connection system boundary is reserved but not implemented.
- Full Firestore Security Rules enforcement for complex cross-collection queries requires Cloud Functions (documented).
