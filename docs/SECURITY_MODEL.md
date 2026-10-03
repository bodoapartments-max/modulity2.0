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

### Step 5 — New Collection Security Rules

All new workspace-scoped collections enforce:
- Authentication required for all operations
- Workspace isolation (PERSONAL: ownerUserId check, ORGANIZATION: active membership check)
- Actor validation via `isValidClientActor` for create operations
- Immutable field protection via `fieldUnchanged` for update operations
- Deny-by-default for delete (except USER-scoped folders by owner)

| Collection | Read | Create | Update | Delete |
|-----------|------|--------|--------|--------|
| deliveries | Workspace member | Workspace member + actor validation | Workspace member + immutable fields | Denied |
| formRequests | Workspace member | Workspace member + actor validation | Workspace member + immutable fields (moduleId, moduleVersion, requester, recipientUserId) | Denied |
| folders | Workspace member | Workspace member + actor validation | Workspace member + immutable fields | USER-scoped: owner only |
| folders/{id}/items | Workspace member | Workspace member | Denied | Workspace member |
| userRecordState | Own user only | Own user only (userId match) | Own user only + immutable fields | Denied |
| shareTokens | Workspace member | Workspace member + actor validation | Workspace member + immutable fields (tokenHash, createdBy) | Denied |

**User Record State** has the strictest isolation: users can only read/write their own starred state. Cross-user state leakage is prevented at the Firestore Security Rules level.

### Step 5.1 — Transaction & Immutability Hardening

**Record Submitted-Data Immutability (Firestore Rules):**
- DRAFT records: `data`, `entityReferences`, `entityReferenceIds` may be updated.
- SUBMITTED/ACTIVE/COMPLETED/CANCELLED/ARCHIVED records: `data`, `entityReferences`, `entityReferenceIds` are immutable. Only operational metadata (`status`, `priority`, `archivedAt`, `archivedBy`, `_previousStatus`, `_updatedAt`) may change.
- `sourceRequestId` and `submittedBy` are always immutable after creation.
- A write changing `priority` + `data` simultaneously is denied.

**FormRequest Completion Security:**
- `resultRecordId` is immutable once set (non-null). A client cannot point a completed request at an arbitrary Record.
- `requestId`, `moduleId`, `moduleVersion`, `requester`, `recipientUserId`, `_createdAt` are always immutable.
- Completion uses a Firestore `runTransaction` to atomically create the Record and update the request — never two separate writes.
- Deterministic Record ID (`req_{requestId}`) prevents duplicate Records from retries.

**Share Token Redemption Security:**
- Redemption uses a Firestore `runTransaction` for atomic check + increment of `redemptionCount`.
- `redeemedByUserId` corresponds to `request.auth.uid` — callers cannot redeem on behalf of another user.
- Expiration and revocation checked inside the transaction boundary, not before.

**Recipient Membership Validation:**
- Delivery and FormRequest creation validate that the recipient is an ACTIVE member of the Organization Workspace.
- Personal Workspace recipients must be the workspace owner.
- Suspended, LEFT, or non-member recipients are rejected at the application service layer.

**Trusted Submission Limitation:**
- FormRequest completion currently runs client-side Firestore transactions. While the transaction ensures atomicity and the deterministic ID prevents duplicates, a sophisticated client could theoretically construct a transaction with manipulated data. Full trusted-submission enforcement requires a Cloud Function or server boundary (deferred for Step 6+).
- The Firestore Rules provide defense-in-depth: sourceRequestId immutability, resultRecordId immutability once set, and submitted data freezing.

---

## 13. API Security

- All endpoints require authentication.
- All endpoints validate `organizationId` against membership.
- Rate limits per user / service identity.
- CORS configured only for known origins.
- Webhooks validate signatures.

---

## Step 10.3 — Module Designer Security

- Designer create/update uses existing ModuleService and existing Personal-owner / Organization ADMIN-or-OWNER Firestore authorization.
- Module code, Workspace, creator, identity, and historical version snapshots remain immutable.
- Designer validation rejects unsupported types/properties, unsafe executable/path keys, duplicate fields/options, invalid listFields, size/bounds violations, and unknown/cross-Workspace Entity Types.
- ModuleService independently resolves EntityReference target types through the current Workspace Entity Type repository before create/update/activation.
- Preview uses FormRenderer-local state and never invokes Record creation.
- No Designer collection, localStorage canonical state, generated JSX, scripts, remote modules, or permission grant exists. CapabilityDefinition persistence is handled by the separate Step 10.4 generic capability layer, not the Designer.

## Step 10.2/10.4 — Capability Engine Security

- Capability Definitions are configuration, never authority, permission, entitlement, credentials, or arbitrary database access.
- Sources are typed canonical refs with explicit Workspace identity; resolver validation rejects unknown, mismatched, and cross-Workspace sources.
- Configuration rejects Firestore paths/raw queries, executable values, scripts, expressions, remote module URLs, JSX/component code, `eval`, and functions.
- Engine-specific validators are trusted built-in code registered locally, not downloaded plugins or provider output.
- `ARCHITECTURE_ONLY` Engines cannot validate ACTIVE Definitions as operational. As of Step 10.4, `calendar` is `AVAILABLE`.
- Read engines use bounded canonical services. Calendar projections are derived from canonical Records and rebuildable.
- CapabilityDefinition persistence is workspace-scoped. Firestore Rules allow read for Workspace members and write/delete only for Personal owners or Organization OWNER/ADMIN; MEMBER is denied.
- Immutable identity/provenance, allowed engine IDs/versions, typed source refs, lifecycle status, and bounded safe configuration are enforced by Rules and service validation.
- Calendar projections never reveal Records the caller could not otherwise read. Event click navigates to canonical Record Detail, not a separate Calendar-owned detail.

## Step 10.1 — Workspace Architect Security

- The Architect reads only the authenticated current Workspace through the existing bounded snapshot repositories; model output cannot specify Firestore paths.
- Workspace names/descriptions/labels are untrusted data and never executable instructions.
- Operational Entities and Records are excluded from default context and are never generated by evolution planning.
- Context is bounded by resource count, fields, bytes, deterministic ordering, and explicit `ANALYSIS_INCOMPLETE` handling.
- Provider output is strict structured input to the existing BuildPlan validator. Semantic confidence cannot authorize reuse, mutation, approval, entitlement, or access.
- Clarification/incomplete plans are not persisted for approval. Valid plans remain fingerprint-bound and subject to OWNER/Personal-owner trusted apply authorization.
- DELETE, replacement, arbitrary SAFE_UPDATE, scripts/JSX, Entity generation, and RelationshipDefinition are prohibited.

## Step 10.0 — Generic Entity Management Security

- Entity list/detail/create/update use existing Workspace-scoped Entity Rules; Personal owner and active Organization members are authorized, outsiders/cross-Workspace users are denied.
- Client actors remain USER/self only. Entity identity, Workspace, Entity Type, creator, and creation timestamps remain immutable.
- Entity lifecycle is restricted to ACTIVE, INACTIVE, or ARCHIVED. Physical delete remains denied because historical Records may reference Entities.
- Core Entity Type definitions remain structurally protected; this does not prevent authorized creation/editing of Core Entity instances.
- Queries require explicit Workspace and Entity Type scope, stable pagination, bounded limits, and configured indexes. UI cannot supply arbitrary collection paths or ordering fields.

## Step 9.0 — Agent/Automat Planning Security

- Provider output is untrusted structured input until deterministic validation succeeds.
- Agent definitions and execution envelopes are versioned, strict, serializable, bounded, and timeout-limited.
- Agent Registry resolution has an injected entitlement/capability boundary; UI visibility is not entitlement enforcement.
- The Orchestrator has no Firestore repository and cannot write Modules, Records, Entities, Ledger, Memberships, permissions, or plans.
- BuildPlans reject unsafe/executable keys, unknown resource properties, broken references, unsupported field/capability configuration, excessive depth/count/size, and Workspace mismatch.
- `INTERNAL_AGENT` remains unavailable to browser canonical writes. Confidence is metadata, never authority.
- Step 9.0/9.1 persist neither executions nor plans, so they add no Firestore collection, Rule, index, trusted actor write, API token, provider secret, or external endpoint.
- Step 9.1 accepts only the current authenticated Workspace from application context, then Firestore Rules authorize six bounded configuration reads. Workspace IDs from arbitrary form input are rejected.
- Before/after snapshot fingerprints verify that planning did not alter canonical configuration. The planner has no mutation method.
- Deterministic structured knowledge runs behind the provider adapter; malformed, oversized, unknown-property, timeout, and provider failures settle without canonical effects.
### Step 9.2 trusted application

- `automatPlan` and `automatApplyPlan` are narrow Auth-required callables in `europe-west1`; no generic Admin endpoint exists.
- Personal owner or active Organization OWNER is verified server-side for persistence, approval, apply, and status. MEMBER/cross-Workspace callers are denied.
- The development entitlement grant is server-side and project-bound to `modulity-2-dev`/Emulator; production subscription resolution remains required.
- Browser clients can read Workspace plans but all plan/lifecycle writes are denied. Top-level operations, locks, and audits are denied by default.
- SHA-256 plan/configuration fingerprints bind approval and reject modified/stale plans.
- CONFLICT and SAFE_UPDATE block apply. Optional type-level relationships are explicit UNSUPPORTED omissions. REPLACE_DELETE is absent.
- The ten-minute renewable server lease prevents concurrent Workspace apply and permits explicit stale-operation recovery.
- Partial success is journaled and resumed non-destructively. No operational data, Ledger sequence, permission, Membership, or Entity instance is created.
- Shared canonical validators are copied into the Functions package by an allowlisted predeploy build; generated copies are not a second authored contract.

## Step 8.1 — Workspace Reset Security

- Workspace Reset is unavailable through Firestore client writes and ordinary repositories.
- Callable verifies Firebase Auth and authorizes Personal owner or active Organization OWNER.
- Admin-only reset locks/audits remain denied by catch-all client Rules.
- Normal Record/Ledger/Audit/Message delete prohibitions remain unchanged.
- Client Workspace updates cannot mutate dataGeneration/lastResetAt/lastResetBy.
- Typed confirmation is accident prevention, not authorization.
- Per-Workspace lock prevents concurrent reset execution; idempotent request IDs make successful retries safe.
- Other Workspaces are never traversed or deleted.

## Step 8 — Reports & Intelligence Security

- ReportDefinition read requires Workspace access; create requires USER/self creator, path identity, ACTIVE v1, bounded arrays, allowlisted source types, no arbitrary collectionPath, and existing same-Workspace source Modules.
- Only the creator may update/archive a ReportDefinition; workspace/report/creator/_createdAt are immutable and version must increment exactly once. Delete denied.
- WidgetDefinition create/update now enforces allowlisted source/type, maximum 10 filters, 12 columns, and result limit 1–100. Owner/workspace/creator identity remains immutable.
- Definitions never grant source-data access. Execution uses existing canonical Record/Entity/Relationship Rules under the authenticated client boundary.
- Browser execution remains an honest-client limitation: Rules constrain persisted definitions, but full trusted analytics and stronger field-level authorization require a future backend/API boundary.
- Cross-Workspace reads/writes, creator spoofing, unsafe sources, arbitrary paths, missing source Modules, and unbounded configurations have negative Emulator coverage.

## Step 7.2 — Workspace Experience Closure Security

- Notification create requires `createdBy.actorType == USER` and `createdBy.actorId == auth.uid`; recipient/resource/creator provenance is immutable. Browser creators remain attributable but are not a fully trusted notification dispatcher.
- Conversation create requires workspace access, USER/self creator, bounded memberIds, and creator membership.
- Conversation metadata read requires workspace access and authenticated UID in immutable memberIds.
- ConversationMember creation requires the target user to have Workspace access and the requester to be an existing member or the creating owner in the same atomic batch.
- Message get/list/create requires a canonical ConversationMember document. List limit is at most 50. senderUserId must equal auth.uid. Update/delete denied.
- Cross-workspace Conversation/Member/Message provenance is denied.

## Step 7.1 — Bootstrap Security

- Authenticated users may `get` only their deterministic `workspaces/personal_{uid}` path before it exists; creation still requires `type: PERSONAL` and `ownerUserId == auth.uid`.
- Workspace list queries remain owner/member constrained.
- Deterministic `userWorkspacePreferences/{uid}` permits owner `get` before document creation and denies collection listing.
- These missing-document read rules are required for idempotent browser bootstrap and do not grant access to another user's Workspace or preferences.

## Step 7 — Workspace Experience Security

- Worksets require active workspace access, valid USER/self creator provenance, immutable identity/workspace/creator fields, and deny deletion.
- WidgetDefinitions are readable and writable only by their owner inside the active workspace; identity, owner, workspace, and creator provenance are immutable.
- Notifications are readable/updateable only by `recipientUserId`; immutable resource/recipient provenance prevents reassignment. Creation requires workspace access.
- User Workspace Preferences use deterministic `{userId}` documents and permit only that user to read/write their workspace-scoped preference.
- Worksets never override Module or Record security rules. Widget queries execute against canonical collections and remain subject to their existing rules.
- Browser-created Notifications remain a trust limitation: full trusted origin validation requires a backend dispatcher.

## Step 6 — Ledger & Audit Security

### Ledger Book Rules
- Workspace isolation via membership/ownership check
- Immutable: workspaceId, ledgerBookId, ledgerCode, createdBy, numberingStrategy
- Delete: always denied

### Ledger Block Rules
- Workspace isolation
- Immutable: workspaceId, ledgerBookId, ledgerBlockId, blockNumber, startSequence, endSequence, capacity, createdBy
- Delete: always denied

### Ledger Entry Rules
- Workspace isolation
- Create: actor must be valid client actor (USER + own UID)
- Immutable: workspaceId, ledgerEntryId, ledgerBookId, ledgerBlockId, recordId, moduleId, moduleVersion, recordType, sequenceNumber, referenceNumber, referenceFormatVersion, registeredAt, registeredBy, _registeredAt
- Status transitions (ACTIVE → CANCELLED/VOIDED) allowed with proper provenance
- Delete: always denied

### Ledger Code Rules
- Workspace isolation
- Create only (reservation)
- Update: always denied
- Delete: always denied

### Audit Entry Rules
- Workspace isolation
- Create: actor must be USER type with actorId == auth.uid (no agent/integration spoofing)
- Update: always denied
- Delete: always denied

### Record Ledger Linkage
- ledgerEntryId, ledgerBookId, referenceNumber: immutable once non-null
- Can be set from null (initial linkage)

### Trusted Actor Boundary
- Clients can only create audit entries with `actorType: 'USER'` and `actorId: request.auth.uid`
- INTERNAL_AGENT and EXTERNAL_INTEGRATION are rejected
- Full trusted-actor enforcement requires Cloud Function boundary (future)

## Step 6.1 — Ledger Consistency & Audit Hardening

### Provenance Validation (Step 6.1)
- LedgerEntry create now validates:
  - Referenced Record must `exists()` in the same workspace
  - Referenced LedgerBook must `exists()` in the same workspace
  - Initial `entryStatus` must be `ACTIVE` (cannot create pre-cancelled entries)
- **Limitation**: Rules can verify existence but cannot validate moduleId/version match, Record eligibility status, or sequence allocation correctness. These are enforced by client-side LedgerService transaction logic.

### Sequence Integrity Limitation
- Firestore Rules **cannot** validate that `sequenceNumber`, `ledgerBlockId`, or `referenceNumber` are correctly allocated from the current block state.
- Sequence allocation is concurrency-safe for honest clients using LedgerService (`runTransaction`).
- **Not fully tamper-resistant**: a malicious client could construct a valid-looking write with an invented sequence number. Full allocation integrity requires a trusted backend (Cloud Function).
- This is an explicit, documented limitation — not a hidden gap.

### Audit Ownership Model (Step 6.1)
- **LedgerService** directly writes durable audit entries for all ledger operations (book creation, entry registration, cancellation, voiding, book close).
- **AuditBridge** handles non-ledger Event Bus events (record, delivery, formRequest) only.
- Ledger events are **excluded** from AuditBridge mapping to prevent duplicate durable AuditEntries.
- Each audit action has exactly one owner (either the business service or the bridge, never both).

### Audit Failure Semantics (Step 6.1)
- Audit persistence is **best-effort** for all operations.
- If a ledger operation succeeds but the subsequent audit write fails, the ledger operation is NOT rolled back.
- AuditBridge catches all errors silently to avoid breaking the main application flow.
- **Do not describe audit as guaranteed permanent accountability** until writes move behind a Cloud Function.

### Timestamp Authority (Step 6.1)
- All Ledger and Audit operations use Firestore `serverTimestamp()` for authoritative historical time.
- Authoritative fields: `_registeredAt`, `_createdAt`, `_updatedAt`, `_openedAt`, `_closedAt`, `_timestamp`.
- Client ISO string fields exist for immediate display only and are non-authoritative.
- Audit query ordering uses `_timestamp`, not client-generated ISO strings.
