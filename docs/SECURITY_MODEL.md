# Modulity 2.0 — Security Model

This document defines the security, authentication, authorization and data isolation principles for Modulity 2.0.

---

## 1. Golden Rules

1. **Never trust the client** for authoritative security decisions.
2. **Authorization is server-authoritative.** UI hiding is not security.
3. **Organization isolation is mandatory.** No cross-organization data leakage.
4. **Sensitive secrets never enter the repository.**
5. **Audit every important action** with an attributable actor.
6. **Use immutable internal IDs**, not human-readable references, for authoritative identity.
7. **Use idempotency keys** for important write operations.

---

## 2. Authentication

- Authentication is performed by an identity adapter (e.g. Firebase Auth).
- The Core receives a verified identity token or service identity.
- Users authenticate individually. Organizations do not log in.
- Service identities / API tokens exist for external agents and integrations.

---

## 3. Authorization

Authorization is centralized in the `permissions` subsystem.

### Concepts

| Concept       | Responsibility                                                    |
| ------------- | ----------------------------------------------------------------- |
| Role          | Named collection of permissions (e.g. admin, manager, inspector)  |
| Permission    | Fine-grained capability (e.g. `module:vehicle-inspection:create`) |
| Group         | Organizational grouping of users (department, team)               |
| Module Access | Which modules a membership can use                                |
| Assignment    | Record/entity-level responsibility                                |
| Entitlement   | Subscription-derived capability limit                             |

### Permission Decision Flow

1. Resolve `userId` from authentication.
2. Resolve active memberships for `userId` + `organizationId`.
3. Resolve roles, permissions, groups, module access from memberships.
4. Resolve entitlements.
5. Evaluate the requested action against the unified policy.
6. Log the decision to audit when sensitive.

### Permission Scope Examples

- `global` — account-level actions
- `organization:<orgId>` — organization-scoped actions
- `module:<moduleCode>` — module-scoped actions
- `record:<recordId>` — record-level actions (e.g. assignment)
- `entity:<entityId>` — entity-level actions

---

## 4. Organization Isolation

Every data query must be scoped to `organizationId` unless it is a global identity operation on the user's own account.

- Database queries include `organizationId` filters.
- API endpoints reject missing or mismatched `organizationId`.
- Composite APIs never return data from multiple organizations in one response.
- Admin features must still enforce explicit organization scoping.

### Firestore Organization Isolation (Step 2.1)

Organization-scoped data is stored as subcollections under `organizations/{organizationId}/`:

- `members/{userId}` — membership documents
- `groups/{groupId}` — group documents
- `invitations/{invitationId}` — invitation documents

This structure enables Firestore Security Rules to enforce organization isolation using the parent document path. A user from Organization A cannot read or modify Organization B data.

**Membership Lookup Strategy:**

Memberships use a deterministic path: `organizations/{orgId}/members/{userId}`. This allows Security Rules to verify membership via `exists()` and `get()` without queries:

```
function isActiveMember(orgId) {
  return exists(.../organizations/$(orgId)/members/$(request.auth.uid))
    && get(.../organizations/$(orgId)/members/$(request.auth.uid)).data.status == 'ACTIVE';
}
```

A reverse index at `userMemberships/{userId}/orgs/{organizationId}` enables efficient "get all memberships for a user" lookups. The canonical membership data lives in the subcollection.

### Workspace Data Collections (Step 3)

Universal Data Core collections are stored under `workspaces/{workspaceId}/`:

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `entityTypes` | workspace member | workspace member | admin/owner (DOMAIN only; CORE protected) | never |
| `entities` | workspace member | workspace member | workspace member (immutable: workspaceId, entityId, createdBy) | never |
| `relationships` | workspace member | workspace member | workspace member (immutable: workspaceId, createdBy) | never |
| `records` | workspace member | workspace member | workspace member (immutable: workspaceId, recordId, createdBy) | never |
| `files` | workspace member | workspace member | never | never |

Access control for each subcollection resolves the parent workspace document to check:
- Personal workspace: `ownerUserId == request.auth.uid`
- Organization workspace: `isActiveMember(organizationId)`

Entity Type updates for DOMAIN types in org workspaces require `isAdminOrOwner`. CORE Entity Types cannot be modified by any client.

### Future Collection Requirements

**NO NEW WORKSPACE-SCOPED FIRESTORE COLLECTION MAY BE ADDED WITHOUT EXPLICIT SECURITY RULES AND CROSS-WORKSPACE NEGATIVE TESTS.**

When adding any new collection that is scoped to an organization or workspace:

1. Place it as a subcollection under `workspaces/{workspaceId}/` or `organizations/{orgId}/`
2. Add read rules requiring workspace ownership or `isActiveMember(orgId)`
3. Add write rules with appropriate role requirements
4. Protect immutable security fields (workspaceId, createdBy, etc.)
5. Add cross-workspace and cross-organization negative tests in `tests/rules/`
6. Document the collection in this file

---

## 5. Firestore Security Rules Architecture

### Rule Patterns

| Pattern | Implementation |
|---|---|
| `isActiveMember(orgId)` | Deterministic `exists()` + `get()` on `organizations/{orgId}/members/{uid}` |
| `isAdminOrOwner(orgId)` | `isActiveMember` + `roles.hasAny(['ADMIN'])` or `roles.hasAny(['OWNER'])` |
| `fieldUnchanged(field)` | Prevents modification of protected fields (type, ownerUserId, organizationId, userId, createdByUserId) |
| Deny-by-default | Explicit `match /{document=**} { allow read, write: if false; }` catch-all |

### Protected Operations

| Operation | Required Authority |
|---|---|
| Read organization data | Active member |
| Update organization profile | ADMIN or OWNER |
| Add member (non-OWNER) | ADMIN or OWNER |
| Change member roles | ADMIN or OWNER (no self-modification, no granting OWNER) |
| Suspend member | ADMIN or OWNER |
| Create/edit/delete group | ADMIN or OWNER |
| Create invitation (non-OWNER role) | ADMIN or OWNER |
| Read invitations | ADMIN or OWNER |

### Actor Identity Enforcement (Step 3.1)

```
CLIENTS MAY NOT SELF-ASSERT TRUSTED ACTOR TYPES.
```

For all client-created workspace data (entities, records, relationships, files):

| Rule | Enforcement |
|------|-------------|
| `createdBy.actorType` must be `USER` | `isValidClientActor()` helper in rules |
| `createdBy.actorId` must equal `request.auth.uid` | `isValidClientActor()` helper in rules |
| `INTERNAL_AGENT` rejected from client writes | `isValidClientActor()` blocks non-USER types |
| `EXTERNAL_INTEGRATION` rejected from client writes | `isValidClientActor()` blocks non-USER types |
| `createdBy` / `uploadedBy` immutable after creation | `fieldUnchanged('createdBy')` on update rules |

Trusted actor types (`INTERNAL_AGENT`, `EXTERNAL_INTEGRATION`) must eventually enter through a trusted backend/API boundary (Cloud Functions, Admin SDK, or similar).

### Trusted Server Operations (Deferred)

The following operations require Cloud Functions or another trusted backend:

| Operation | Reason |
|---|---|
| Ownership transfer | Prevents zero-owner state; needs transactional verification |
| Invitation acceptance | Must verify token and create membership server-side |
| Role escalation to OWNER | Only existing OWNERs should grant OWNER; currently blocked in rules |
| INTERNAL_AGENT writes | Trusted actor type; cannot be self-asserted by browser clients |
| EXTERNAL_INTEGRATION writes | Trusted actor type; requires authenticated backend boundary |

These are documented and deferred. The current rules enforce the safest practical boundary: OWNER role cannot be granted via client writes (except during initial org bootstrap by the creator). Trusted actor types are blocked from all client writes.

### Event/Audit Boundary

- The in-memory Event Bus is NOT durable audit history.
- Platform Event != Durable Audit Record != Ledger Entry.
- Client-emitted events are not authoritative security/audit evidence.
- The future Audit/Ledger layer must use trusted persistent records.

---

## 7. Service Identities & API Tokens

External agents and integrations use service identities.

- Token stored as a hash (or via identity provider).
- Token has a scope: module access, permissions, rate limit.
- Requests include idempotency key.
- Audit log attributes actions to the service identity.

---

## 8. Record & Entity Access

A user can access a Record if:

1. They are a member of the Record's organization.
2. Their role/module access permits reading the Record's module.
3. AND at least one of:
   - They created the Record
   - They are assigned to the Record
   - They are the recipient
   - They belong to a group with access
   - A share grants them access
   - Their role grants blanket read access

Similar rules apply for update, approve, delete, etc.

---

## 9. Input Validation

- All input is validated against schemas on the server.
- Form data is validated by the Module Runtime using the module's form schema.
- HTML-rich content is sanitized before storage and before rendering.
- `dangerouslySetInnerHTML` is avoided unless content is properly sanitized.

---

## 10. Audit

Every security-relevant action produces an `AuditEvent`:

- Login / logout
- Organization switch
- Membership change
- Permission grant/revoke
- Record create/update/status change
- Entity create/update/delete
- Ledger book open/close
- Sharing create/revoke
- Billing entitlement change
- Agent action (when affecting state)

Audit events are append-only and include:

- `actorId` (user or service)
- `organizationId`
- `action`
- `targetType` / `targetId`
- Server-authoritative timestamp
- Reason (when available)
- Diff of changed fields

---

## 11. Secrets Management

- `.env.example` is committed with placeholder values.
- `.env`, `.env.local`, provider credentials, payment keys, agent provider keys are never committed.
- Production secrets are managed by the deployment environment.
- Firebase service account keys, Stripe keys, LLM API keys must be injected at runtime.

---

## 12. Threat Mitigations

| Threat                    | Mitigation                                     |
| ------------------------- | ---------------------------------------------- |
| IDOR                      | Every read/write scoped to organizationId      |
| Mass assignment           | Schema validation, explicit allowed fields     |
| XSS                       | Sanitize rich text; no raw HTML injection      |
| Replay / duplicate writes | Idempotency keys                               |
| Privilege escalation      | Server-authoritative permission checks         |
| Data leakage via search   | Search queries scoped to organizationId        |
| Secret leakage            | .gitignore, secret scanning, no hardcoded keys |

---

## 12b. Module Security Rules (Step 4)

Path: `workspaces/{workspaceId}/modules/{moduleId}`

### Read
- Authenticated + workspace access (personal owner or org active member).

### Create
- Authenticated + workspace access.
- `workspaceId` field must match path.
- `createdBy` must be valid client actor (`actorType == 'USER'`, `actorId == request.auth.uid`).
- Organization workspaces: requires ADMIN or OWNER role.

### Update
- Authenticated + workspace access.
- Organization workspaces: requires ADMIN or OWNER role.
- Immutable fields protected: `workspaceId`, `moduleId`, `moduleCode`, `createdBy`, `createdAt`, `_createdAt`.
- Archived modules cannot be modified (except re-archiving, which is a no-op).

### Delete
- Denied. Modules must not be hard-deleted when historical Records may reference them.

### Submission Trust Boundary
- Browser form validation is UX.
- Application service validation (ModuleSubmissionService) is deterministic business validation.
- Firestore Rules are the storage authorization boundary.
- Firestore Rules currently cannot fully reproduce arbitrary Module Form Schema validation.
- Therefore a malicious client with direct Firestore access may be able to construct semantically invalid `Record.data` unless final submission is later moved behind a trusted backend.
- Do NOT describe current client submission as fully server-authoritative.

### Emulator Test Coverage (21 tests)
- Personal workspace: owner create/read, non-owner denied.
- Organization workspace: OWNER/ADMIN create, MEMBER create denied, MEMBER read allowed.
- Cross-workspace isolation: personal workspace, org workspace.
- Actor spoofing: wrong actorId, non-USER actorType.
- Workspace field mismatch.
- Immutable field changes: workspaceId, moduleId, moduleCode, createdBy.
- Archived module update protection.
- Delete denied.
- Unauthenticated access denied.

## 12c. Module Version Snapshot Rules (Step 4.1)

Path: `workspaces/{workspaceId}/modules/{moduleId}/versions/{version}`

### Read
- Authenticated + workspace access (personal owner or org active member).

### Create
- Authenticated + workspace access.
- `workspaceId` and `moduleId` must match path parameters.
- `createdBy` must be valid client actor.
- Organization workspaces: requires ADMIN or OWNER role.

### Update
- **DENIED**. Version snapshots are immutable.

### Delete
- **DENIED**. Version snapshots must never be removed.

## 12d. Module Code Reservation Rules (Step 4.1)

Path: `workspaces/{workspaceId}/moduleCodes/{normalizedCode}`

### Read
- Authenticated + workspace access.

### Create
- Authenticated + workspace access.
- `workspaceId` must match path.
- `reservedBy` must be valid client actor.
- Organization workspaces: requires ADMIN or OWNER role.

### Update
- **DENIED**. Reservations are immutable. Codes are never reused.

### Delete
- **DENIED**. Reservations are permanent.

## 12e. Record Provenance Immutability (Step 4.1)

Path: `workspaces/{workspaceId}/records/{recordId}`

Record update rules now enforce immutability on:
- `moduleId` — cannot be changed after creation.
- `moduleVersion` — cannot be changed after creation.
- `recordType` — cannot be changed after creation.

These fields, combined with `workspaceId`, form the authoritative historical interpretation key.

### Emulator Test Coverage — Step 4.1 (28 new tests, 161 total)
- Version snapshots: owner create, owner read, update denied, delete denied, cross-workspace read/write denied, spoofed actor denied, mismatched moduleId/workspaceId denied, org ADMIN create, org MEMBER denied, unauthenticated denied.
- Code reservations: owner create/read, update denied, delete denied, cross-workspace read/create denied, spoofed actor denied, mismatched workspaceId denied, org ADMIN create, org MEMBER denied, unauthenticated denied.
- Record provenance: moduleId immutable, moduleVersion immutable, recordType immutable, status update allowed, data update allowed.

---

## 13. API Security

- All endpoints require authentication.
- All endpoints validate `organizationId` against membership.
- Rate limits per user / service identity.
- CORS configured only for known origins.
- Webhooks validate signatures.
