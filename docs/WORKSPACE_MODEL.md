# Modulity 2.0 — Workspace & People Model

This document explains the Workspace, Organization, Membership, and related concepts for developers and agents.

---

## Core Concepts

### What is a Workspace?

A **Workspace** is the common operating context for all platform features. Every module, record, entity, report, and widget operates within a Workspace.

There are two types:

| Type           | Description                                  |
| -------------- | -------------------------------------------- |
| `PERSONAL`     | One per user, auto-created on first login    |
| `ORGANIZATION` | One per organization, created with the org   |

### What is the difference between User, Person, Membership, and Employee?

| Concept      | What it is                                                    | Where it lives           |
| ------------ | ------------------------------------------------------------- | ------------------------ |
| **User**     | Authenticated Modulity account (identity)                     | `core/identity/user.js`  |
| **Person**   | Human profile/presentation info (display name, phone, avatar) | `core/workspace/person.js` |
| **Membership** | Relationship between a User and an Organization (roles, status) | `core/workspace/membership.js` |
| **Employee** | Future business/domain entity representing employment         | Not yet implemented      |
| **Role**     | Authorization/business responsibility within an organization  | `core/workspace/role.js` |
| **Position** | Future business job position (Manager, Receptionist, etc.)    | Not yet implemented      |

**These are different concepts and must never be merged.**

---

## Workspace Architecture

```
User
 ├── Personal Workspace (auto-created, exactly one)
 │
 ├── Organization A (via Membership)
 │    └── Organization Workspace
 │
 ├── Organization B (via Membership)
 │    └── Organization Workspace
 │
 └── Organization C (via Membership)
      └── Organization Workspace
```

The application always knows:
- `currentUser` — from AuthProvider
- `currentWorkspace` — from WorkspaceProvider

---

## Organization

An **Organization** is the generic platform concept for any type of business, institution, or group. Internal type is always "Organization", though UI may show friendlier labels.

Supported organization types: `COMPANY`, `HOTEL`, `SCHOOL`, `THEATRE`, `ASSOCIATION`, `CONSTRUCTION`, `SERVICE`, `OTHER`.

### Organization Creation Flow

When a user creates an Organization, this happens as one **atomic batch write**:

1. Create Organization document
2. Create Organization Workspace document
3. Create Membership with OWNER role for the creator (subcollection)
4. Create user membership index entry
5. Emit audit events (after batch commits)
6. Switch user into the new workspace

All four Firestore writes happen in a single `writeBatch()` — either all succeed or none are written. This prevents orphaned organizations without workspaces or OWNER memberships.

---

## Membership

**Membership** represents the `User ↔ Organization` relationship.

| Status      | Meaning                          |
| ----------- | -------------------------------- |
| `INVITED`   | Invited but not yet joined       |
| `ACTIVE`    | Active member                    |
| `SUSPENDED` | Temporarily suspended            |
| `LEFT`      | Left the organization            |

### System Roles

| Role     | Description                                |
| -------- | ------------------------------------------ |
| `OWNER`  | Full organization ownership/administration |
| `ADMIN`  | Organization administration                |
| `MEMBER` | Standard organization membership           |

### Owner Safety Invariant

An organization must never have zero owners. Role changes and status changes that would remove the last owner are rejected.

---

## Groups

**Groups** are reusable organization-level grouping concepts (e.g., Management, Reception, Maintenance). They do not have permissions or modules attached yet.

---

## Invitations

**Invitations** allow users to join organizations. The domain contract is defined; full server-side acceptance logic requires Cloud Functions for security.

Statuses: `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`.

---

## Workspace Context

The `WorkspaceProvider` exposes:

- `currentWorkspace` — the active workspace
- `availableWorkspaces` — all workspaces the user can access
- `currentMembership` — the user's membership in the current org (null for personal)
- `switchWorkspace(workspaceId)` — switch to a different workspace
- `refreshWorkspaces()` — reload workspace list
- `loading`, `error` — async state
- `isPersonalWorkspace`, `isOrganizationWorkspace` — convenience booleans

The last selected workspace is persisted in localStorage but verified on load.

---

## Firestore Data Architecture

### Top-level Collections

| Collection | Document ID | Key Fields |
|---|---|---|
| `users` | userId | displayName, email, phone, avatarUrl |
| `workspaces` | workspaceId | type, name, ownerUserId, organizationId |
| `organizations` | organizationId | name, type, country, description, createdByUserId |

### Organization Subcollections

All organization-scoped data is stored as subcollections under `organizations/{orgId}/`:

| Subcollection | Document ID | Key Fields |
|---|---|---|
| `members` | userId | organizationId, userId, status, roles |
| `groups` | groupId | organizationId, name, description |
| `invitations` | invitationId | organizationId, email, role, status, expiresAt |

### User Membership Index

| Collection | Path | Purpose |
|---|---|---|
| `userMemberships` | `userMemberships/{userId}/orgs/{organizationId}` | Reverse index for "get all orgs for a user" lookups |

The canonical membership data lives in `organizations/{orgId}/members/{userId}`. The `userMemberships` index is a lightweight copy for query efficiency, written atomically with the canonical doc.

### Why Subcollections?

The subcollection structure (`organizations/{orgId}/members/{userId}`) enables **deterministic Firestore Security Rule lookups**. Security Rules can verify membership via a single `exists()` or `get()` call using the document path — no queries needed. This is critical because Firestore Security Rules cannot perform queries.

---

## Architecture Boundaries

```
UI (Features)
 ↓
Application Services (core/workspace/*Service.js)
 ↓
Domain Models (core/workspace/*.js)
 ↓
Repository Contracts (core/workspace/*Repository.js)
 ↓
Firestore Repositories (infrastructure/firebase/firestore*.js)
 ↓
Firestore Security Rules (firestore.rules)
```

React components never call Firestore directly. Security rules enforce authorization independently of the application layer.

### Security Boundaries

Authorization is enforced at **two layers**:

1. **Application layer** (services): capability checks using `hasCapability(roles, capability)`
2. **Database layer** (Firestore Security Rules): organization isolation, role verification, field protection

Neither layer alone is sufficient. The application layer provides user-friendly error messages and prevents unnecessary network requests. The database layer prevents bypass via modified clients.

See `docs/SECURITY_MODEL.md` for full details.
