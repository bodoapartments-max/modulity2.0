# Notification Architecture (Step 17)

ONE generic notification domain. Records, Ledger, Automat, Calendar, Chat,
Approval, Workflow, Tasks, Scheduling, Documents and future Integrations
request notifications through the SAME architecture — never per-feature
notification systems.

```
Trusted business action
    → Notification Intent (declarative, trusted input only)
        → RecipientResolution (deterministic list)
            → NotificationPolicy (template presentation)
                → Canonical Notification (server-authored)
                    → DeliveryRouter
                        → IN_APP adapter (the Notification document is the inbox)
                        → EMAIL / PUSH / WEBHOOK — future seams only
```

## Canonical model

`src/core/notifications/notificationContract.js` (contract `1.0.0`).

Fields:
`notificationId` (deterministic), `workspaceId`, `recipientUserId`,
`eventType`, `type` (legacy mirror), `title`, `message`, `contextReference`
(`{ type, id, workspaceId }` — a pointer, never a copy), `actionUrl`,
`priority`, `status` (UNREAD/READ/ARCHIVED), `metadata` (bounded),
`createdBy` (server-derived), `_createdAt` (serverTimestamp).

**Never in payloads:** `notificationId`, `status`, `readAt`, `createdAt`,
`recipientUserId` at intent level, or any executable content. The intent
schema rejects them outright.

## Notification != Audit

- **Audit** (`auditEntries`) is immutable evidence of what happened — a
  cross-surface cross-time fact, writing in the canonical transaction.
- **Notification** (`notifications`) is a user-facing attention artifact with
  its own lightweight lifecycle. Notification failure NEVER invalidates a
  committed mutation; Audit has no dependency on notification delivery.

Record History reads Audit. Notification Center reads Notifications.

## Intents, policy, recipients

| Piece | Role |
|---|---|
| `validateNotificationIntent` | Trusted-input contract — declarative data only |
| `NOTIFICATION_TEMPLATES` | deterministic presentation per event (title/message/priority/actionUrl) |
| `resolveRecipients` | `SELF_FROM_ACTOR`, `EXPLICIT_USER` (+ `excludeActorRecipient` for opt-out) |

Receiving a notification **does not** grant access — opening a context link
re-enters normal Workspace authorization.

## Trusted creation boundary

`functions/src/notificationEngine.js`: `processNotificationIntent(db, intent)`.
Commands call it AFTER the canonical transaction commits:

- `recordCommand` emits `record.created` / `record.draft_saved`
- Other engines opt-in deliberately (none currently — spam avoidance, per
  Step 17 scope)

Recipient workspace access is verified **again** inside the engine
(personal-owner or active org member) because Admin SDK bypasses Rules.

## Idempotency

Notification id = `op_{operationId}_{eventType}_{recipientUserId}`. The
engine writes create-only semantics: if the doc already exists, nothing
changes — including the user's read-state. 10 retries → 1 notification.
Two distinct operations → 2 notifications (ids differ by `operationId`).

## Read-state

- Recipient-owned fields: `status` (`UNREAD`/`READ`/`ARCHIVED`) and
  `_readAt`.
- Firestore Rules let the recipient flip ONLY those fields on their own
  documents; all content, context, identity and timestamps are immutable.
- Canonical creation (server-only) writes `UNREAD` initial state.

## Notification Center

`/app/notifications`:
- newest-first bounded list (25/page, cursor-paginated via `listForUserPage`),
- unread/read badges + attention priority badge,
- per-item Mark read, bulk "Mark all read",
- deep link to `actionUrl`,
- empty/loading/error states (design-system primitives),
- header bell (`NotificationButton`) — bounded unread counter (≤100 window).

## Delivery adapters

Only `IN_APP` is implemented (the canonical document IS the inbox store).
`DELIVERY_CHANNELS` lists EMAIL/PUSH/WEBHOOK as future seams; the router
skips them deterministically. A future failure in those adapters can never
duplicate the canonical Notification.

## Capability boundary

Notification is NOT a user-configurable `CapabilityDefinition` today (unlike
Calendar). Canonical persistence, recipient security and trusted creation
live in Core. Future per-user per-event policy (mute/digest preferences)
belongs to a later capability milestone — **documented boundary**, not
implemented.

## Event Bus boundary

The in-browser Event Bus is a UI refresh mechanism only. That authority for
canonical Notification creation lives exclusively in trusted server code.
The legacy browser `notificationBridge` (record.sent → inbox) is retired —
delivery/FormRequest domains will re-gain notifications when they receive
their own trusted commands (explicit debt).

## Reset behavior

Workspace data reset recursively deletes `notifications` for the workspace
(existing contract semantics — communication artifacts tied to that
workspace's business state are reset with it).

## Performance

- Recipient-scoped, ordered queries only; never "all notifications in a
  workspace."
- Unread counter: bounded to the first 100 entries — documented cap.
- No listeners, no unbounded startup fetch.
