# ADR-0014 — Workspace Chat & Contextual Conversations

## Status

Accepted — Step 18 (implemented, verified on `modulity-2-dev`).

## Context

The repository had no canonical Chat surface. Pre-existing UI stub code listed
conversations without a governed write path.

We need a workspace-scoped conversation model that:

- keeps `Conversation ≠ Record ≠ Message` strictly separate;
- attaches communication to canonical business context by reference only;
- enforces one trusted write boundary (like recordCommand / ledgerCommand /
  adminCommand);
- produces deterministic notifications for DM/mention;
- stays portable beyond React.

## Decision

### One canonical conversation per target

| Type | ID | Authorship |
|---|---|---|
| DIRECT | `dm_{uidA}_{uidB}` (sorted) — deterministic, rebirth-proof | chatCommand |
| GROUP | `ch_<random>()` | chatCommand |
| WORKSPACE | deferred — see Known Gaps | — |
| CONTEXT | `ctx_{type}_{id}` — deterministic per referenced object | chatCommand |

Deterministic ids mean retry-safe creation; the same DM/context conversation
can never duplicate.

### Trusted command contract (`chatCommand`)

Six typed commands (CREATE_DIRECT_CONVERSATION, CREATE_CHANNEL,
CREATE_CONTEXT_CONVERSATION, POST_MESSAGE, MARK_READ, ARCHIVE_CONVERSATION)
with:

- server-derived actor, timestamps, membership checks;
- operation journal for retries (idempotent replays return stored outcome);
- transaction writes: conversation doc + members subdocs + optional message
  and read cursor in one commit;
- post-commit best-effort Notification intents (direct → other member;
  mention → mentioned user) via `notificationEngine`, never blocking.

### Read model stays on Firestore

- Conversations: `listForUser` via `memberIds array-contains` (workspace
  Rules-guard list — no cross-member leak via readState / messages).
- Messages: bounded page fetches (`limit 50`).
- Read state: per-user doc under `conversations/{id}/readStates/{uid}`.

### Context reference

Closed contract `CONTEXT_REFERENCE_TYPES = RECORD | ENTITY | MODULE`.

ID is `ctx_<type>_<id>` — deterministic, workspace-scoped, shape-validated
server-side. Clients supply `type/id`; the trusted engine verifies
existence before writing.

### Calendar & Records acceptance fixes enter this Step's scope

- Calendar: day-level window normalization — the same window on revisit
  now maps to the same cache key.
- Records: module metadata is pulled from `workspaceQueryCache` before
  rendering, with a stable placeholder during cold load instead of a
  technical fallback title.

## Consequences

- Chat identity/authorization continues to flow through the same trusted
  boundary machinery as other Mutations: emails, actor ids, timestamps and
  context references are never client-supplied.
- Conversations survive workspace reset cleanly (they belong to a chat
  collection that the reset contract already sweeps).
- The legacy Step 7 client-write path was fully removed from browser rules;
  existing DEV conversations stay untouched but their member subcollections
  existed under the previous rulebook, while new ones are created
  transactionally with the engine.

## NOTE — member lifecycle note

The engine writes members in one batch; add/remove of members is not part of
Step 18 and is a pending gap (covered in Step 19's organization UX track).
