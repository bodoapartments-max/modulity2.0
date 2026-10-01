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

- Step 2.1: Firestore Security Hardening.
  - Redesigned membership storage: subcollections at `organizations/{orgId}/members/{userId}` for deterministic Security Rules lookups.
  - Moved groups to `organizations/{orgId}/groups/{groupId}` subcollection.
  - Moved invitations to `organizations/{orgId}/invitations/{invitationId}` subcollection.
  - Added `userMemberships/{userId}/orgs/{orgId}` reverse index for efficient user membership queries.
  - Rewrote `firestore.rules` with organization isolation, role-based enforcement, field immutability, and deny-by-default.
  - Organization creation now uses atomic `writeBatch()` (org + workspace + membership + index in one commit).
  - Added `firestoreOrganizationBootstrap.js` for atomic org creation.
  - Security Rules prevent: cross-org access, self-promotion, OWNER escalation by non-OWNER, field tampering (organizationId, userId, type, ownerUserId, createdByUserId), suspended member access, unauthorized invitation creation/read, and access to unknown collections.
  - Added 64 Firebase Emulator Security Rules tests covering all attack vectors.
  - Updated `docs/SECURITY_MODEL.md` with rule patterns, trusted operations, and future collection requirements.
  - Updated `docs/WORKSPACE_MODEL.md` with new data architecture.
  - Added `npm run test:rules` command for emulator-based Security Rules testing.

- Step 3: Universal Data Core.
  - Core domain models: ActorRef, EntityType, Entity, Relationship, Record, FileMeta.
  - Entity Type Registry with CORE and DOMAIN categories.
  - 8 Core Entity Types seeded idempotently: PERSON, EMPLOYEE, CUSTOMER, SUPPLIER, VEHICLE, EQUIPMENT, LOCATION, DOCUMENT.
  - Schema contract for Entity Type field definitions (text, number, date, boolean, select, entity-reference, file-reference).
  - Entity Reference contract for typed, workspace-scoped cross-object links.
  - Reference Resolver with workspace isolation enforcement.
  - Relationship model supporting typed, workspace-scoped links between objects.
  - Record foundation with multi-actor model (createdBy, submittedBy), lifecycle (DRAFT through ARCHIVED), and entity reference validation.
  - File/Attachment metadata model with provider-independent storage contract.
  - Repository contracts: EntityTypeRepository, EntityRepository, RelationshipRepository, RecordRepository, FileRepository.
  - Firestore adapters for all 5 new collections under `workspaces/{workspaceId}/`.
  - Application services: EntityTypeService, EntityService, RelationshipService, RecordService, FileService (all React-independent).
  - Firestore Security Rules for entityTypes, entities, relationships, records, files — workspace ownership, immutable fields, CORE type protection, deny-by-default.
  - 35 new Firebase Emulator security tests (99 total) covering positive, negative, cross-workspace, immutable field, and deny-by-default scenarios.
  - 83 new unit tests (190 total) for all domain models, validation, schema contract, and core entity types.
  - Minimal Entity browser/detail UI: EntityTypesPage, EntitiesPage, EntityDetailPage.
  - Entity Type management UI with Domain type creation including field definitions.
  - Entity detail shows type, status, data, relationships, and related record count.
  - Platform events emitted for entity_type, entity, relationship, record, and file operations.
  - `docs/UNIVERSAL_DATA_CORE.md` documenting full architecture, query strategy, security rules, multi-industry proof.
  - Updated `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `AGENTS.md`.

- Step 3.1: Universal Data Integrity Hardening.
  - Full field type validation: text (string, minLength, maxLength), number (finite, min, max), date (ISO 8601), boolean, select (option set), entity-reference (canonical structure), file-reference (non-empty string).
  - Unknown-field policy: undeclared fields in Entity data are rejected.
  - Field definition hardening: key format validation (`/^[a-zA-Z][a-zA-Z0-9_]*$/`), duplicate key rejection, select options required, min/max consistency, minLength/maxLength consistency, required must be boolean.
  - `validateFieldDefinitions()` validates entire field set including cross-field uniqueness.
  - Canonical `validateEntityReference()` shared across EntityService, RecordService, and future consumers.
  - Entity Reference type integrity: `ref.entityTypeId` must match resolved entity's actual `entityTypeId`.
  - Record reference dual-storage: canonical `entityReferences[]` (source of truth) + derived `entityReferenceIds[]` (query index).
  - Entity Type existence and ACTIVE status check before Entity creation.
  - Entity update revalidation: data changes revalidated against Entity Type schema.
  - Record draft update revalidation: entityReferences, data, attachments revalidated; entityReferenceIds recomputed.
  - Actor identity enforcement in Firestore Rules: `isValidClientActor()` enforces `actorType == 'USER'` and `actorId == request.auth.uid` for all workspace data creates.
  - INTERNAL_AGENT and EXTERNAL_INTEGRATION rejected from client writes.
  - 13 new Firebase Emulator security tests (112 total) covering actor spoofing, trusted actor type rejection, cross-collection actor identity, and immutable actor fields.
  - 53 new unit tests (243 total) for field type validation, field definition validation, entity reference validation, record reference indexing, and actor ref edge cases.
  - Updated `docs/UNIVERSAL_DATA_CORE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `AGENTS.md`, `CHANGELOG.md`.

### Notes

- No Modulity V1 code imported.
- Module Engine, Form Renderer, full Record UI, ListView, TableView, Ledger, Widgets, Reports, Chat, Notifications, Agents, Billing checkout, External API are intentionally not implemented in Step 3.
- Invitation acceptance, ownership transfer, OWNER role escalation still require Cloud Functions.
- File upload binary handling is deferred — only metadata model and storage contract established.
- Schema migration framework is documented conceptually but not implemented.
- Cross-workspace sharing is denied by default; future sharing system deferred.
