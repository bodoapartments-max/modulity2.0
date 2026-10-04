# ADR-0009 — Generic Notification Capability and Delivery Boundary

**Status:** Accepted (Step 17)
**Date:** 2026-10-04

## Context

Before Step 17 the platform had several notification paths:

1. `recordCommand` callable wrote "record created / draft saved" inbox items
   post-transaction using deterministic ids — trusted but ad-hoc, actor-only.
2. A browser `notificationBridge` wrote inbox items from local Event Bus
   events (e.g. `record.sent`) — client-authoritative, non-reviewable.
3. Firestore Rules allowed BROWSERS to create notifications with client
   actor claims, and to mutate most fields of any notification they received.

That gave two sources of truth risk: forged inbox items (attack surface) and
notification building blocks scattered per feature (duplication).

## Decision

1. **One canonical Notification domain** (`src/core/notifications/`) with a
   versioned contract: intent-envelope validation, context reference model
   (pointers, never copies), deterministic id per
   (operationId, eventType, recipientUserId).
2. **Trusted server engines author notifications.** Trusted commands call
   `processNotificationIntent` after the canonical transaction; recipient
   access is re-verified against the workspace model because Admin SDK
   bypasses Rules. Intent payloads containing authority fields (`status`,
   `readAt`, `notificationId`, `recipientUserId`, `createdAt`) are rejected.
3. **Browser ownership limited to read-state.** Rules deny any notification
   creation, and let recipients flip ONLY their own `status`/`readAt`.
   Everything else — context, content, identity, timestamps — is immutable.
4. **Delivery channels routed behind a seam.** Only IN_APP exists; EMAIL/
   PUSH/WEBHOOK are explicit future adapters receiving canonical artifacts —
   never producing them.
5. **Not built:** Chat notifications (Step 18), per-user routing policies
   (future Capability milestone), delivery/FormRequest notification
   migration (deferred with those domains), external email provider.

## Consequences

- Notifications cannot be forged by browsers; retries cannot duplicate them;
  read-state survives replays.
- Future engines (Approval/Workflow/Task/Chat/Scheduling) reuse the same
  intent + dedupe + delivery architecture without inventing persistence.
- Legacy `record.sent` notifications stop being written (documented gap —
  restored when delivery gets a trusted command).

## Alternatives considered

- A per-feature notification model per engine — rejected: directly
  contradicts "one canonical architecture," triples test surface.
- A user-configurable NotificationDefinition capability now — rejected:
  persistence/security must not be user-configurable; preferences come
  later over a stable canonical base.
