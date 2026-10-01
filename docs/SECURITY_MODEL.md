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

---

## 5. Service Identities & API Tokens

External agents and integrations use service identities.

- Token stored as a hash (or via identity provider).
- Token has a scope: module access, permissions, rate limit.
- Requests include idempotency key.
- Audit log attributes actions to the service identity.

---

## 6. Record & Entity Access

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

## 7. Input Validation

- All input is validated against schemas on the server.
- Form data is validated by the Module Runtime using the module's form schema.
- HTML-rich content is sanitized before storage and before rendering.
- `dangerouslySetInnerHTML` is avoided unless content is properly sanitized.

---

## 8. Audit

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

## 9. Secrets Management

- `.env.example` is committed with placeholder values.
- `.env`, `.env.local`, provider credentials, payment keys, agent provider keys are never committed.
- Production secrets are managed by the deployment environment.
- Firebase service account keys, Stripe keys, LLM API keys must be injected at runtime.

---

## 10. Threat Mitigations

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

## 11. API Security

- All endpoints require authentication.
- All endpoints validate `organizationId` against membership.
- Rate limits per user / service identity.
- CORS configured only for known origins.
- Webhooks validate signatures.
