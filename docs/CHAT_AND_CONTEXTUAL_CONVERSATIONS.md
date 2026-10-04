# Workspace Chat & Contextual Conversations (Step 18)

**Scope:** Real-time business-context communication backed by a single trusted
command boundary. Not a communication suite — a conversation layer.

## Canonical model

```
Conversation  workspaces/{wsId}/conversations/{conversationId}
  ├─ members/{userId}        conversation membership (server-managed)
  ├─ messages/{messageId}    immutable messages
  └─ readStates/{userId}      per-user read cursor

Message      — { messageId, conversationId, workspaceId, senderUserId, content,
                 replyToMessageId = null, mentionedUserIds, objectReferences,
                 createdAt }
               (edit/delete deferred — see GAP-015)
```

### Conversation types

| Type | Who | Context reference |
|---|---|---|
| DIRECT | exactly two user ids | none |
| GROUP | named member list | none |
| CONTEXT | creator + anyone who opens it (shared view) | RECORD / ENTITY / MODULE |

ID is deterministic — `dm_<uidA>_<uidB>`, `ctx_<type>_<id>`, `ch_<rand>()`.

## Trusted boundary

`chatCommand` callable — the only write authority. Browser: read only,
write intent through `services.conversation.*` calling the callable. Journal +
fingerprint + lease protection exactly like recordCommand/adminCommand.

- CREATE_DIRECT_CONVERSATION — server verifies target is an active workspace member
- CREATE_CHANNEL — server verifies every member id
- CREATE_CONTEXT_CONVERSATION — server validates closed context ref + reads the object
- POST_MESSAGE — server stamps sender, timestamp, mentions, refs; raises
  notifications post-commit (best effort)
- MARK_READ — per-user read cursor write
- ARCHIVE_CONVERSATION — idempotent lifecycle transition

Rules deny direct browser writes for all four collections. Browser read filter:
memberIds array-contains + type-CONTEXT relaxation.

## Notification integration

POST_MESSAGE → deterministic notification intents via Step 17's channel:

- DIRECT: notify the other member (`chat.direct_message`).
- Any: each mentioned user (`chat.mentioned`), deduped by
  `operationId:mention:<uid>`.
- CONTEXT: mentioned users only (keeps noise out of workspaces).

No separate chat notifications. One operation retry → no duplicate
notification (ids embed operationId).

## Calendar & Records acceptance fixes inside this Step

- Calendar: `windowBounds` now snaps to day boundaries; the cache key is
  stable across brief navigation, so revisits render instantly.
- Records: module metadata comes from `workspaceQueryCache` first; during
  cold load the row renders a stable placeholder instead of the technical
  fallback title.

## Reset

`conversations`, `records`, `entities`, `modules`, `moduleCategories`,
`recordOperations`, `auditEntries`, `userWorkspacePreferences`, and their
subcollections are swept by the existing workspaceReset contract. No chat
ghosts remain.

## Portability & agent-readiness

Domain model + command contract live in `src/core/chat/`, React stays a thin
client. Future agents will discover the capability by reading the typed
contract and emitting trusted commands — nothing new needed for Step 21.
