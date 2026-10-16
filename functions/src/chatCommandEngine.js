/**
 * Trusted Chat Command Engine (server-side, Admin SDK).
 *
 * Conversations, Messages and Read-States are authored HERE — browsers are
 * readers and intent-collectors. POST_MESSAGE emits deterministic
 * Notification intents (direct → other member; mention/channel/context →
 * mentioned users); retries replay the journal instead of duplicating.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  validateChatCommand,
  CHAT_COMMAND_TYPES,
  CHAT_COMMAND_ERROR_CODES,
} from './generated/src/core/chat/chatCommandContract.js';
import {
  createConversation,
  createMessage,
  directConversationId,
  contextConversationId,
  validateContextReference,
} from './generated/src/core/chat/chatDomain.js';
import { NOTIFICATION_EVENT_TYPES } from './generated/src/core/notifications/notificationContract.js';
import { processNotificationIntent } from './notificationEngine.js';
import {
  OPERATION_STATUS,
  OPERATION_LEASE_MS,
  MAX_RECOVERY_ATTEMPTS,
  computeOperationFingerprint,
  operationDoc,
  buildOperationDocument,
  peekCompletedOperation,
} from './operationJournal.js';

const CODES = CHAT_COMMAND_ERROR_CODES;
const fail = (code, message, details = {}) => {
  const httpCode =
    code === CODES.UNAUTHENTICATED ? 'unauthenticated'
    : code === CODES.WORKSPACE_NOT_FOUND || code === CODES.RESOURCE_NOT_FOUND || code === CODES.CONTEXT_NOT_FOUND ? 'not-found'
    : code === CODES.WORKSPACE_FORBIDDEN || code === CODES.NOT_MEMBER || code === CODES.CONTEXT_FORBIDDEN ? 'permission-denied'
    : 'failed-precondition';
  throw new HttpsError(httpCode, message, { code, ...details });
};

const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 18)}`;

// ─── Authorization helpers ─────────────────────────────────────────────────

async function loadWorkspaceMemberOrOwner(db, workspaceId, userId) {
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  if (!wsSnap.exists) fail(CODES.WORKSPACE_NOT_FOUND, 'Workspace not found.');
  const workspace = wsSnap.data();
  if (workspace.type === 'PERSONAL') {
    if (workspace.ownerUserId !== userId) fail(CODES.WORKSPACE_FORBIDDEN, 'Only the Personal Workspace owner may use Chat here.');
    return { workspace, authority: 'PERSONAL_OWNER' };
  }
  if (workspace.type === 'ORGANIZATION') {
    const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
    if (!member.exists || member.data().status !== 'ACTIVE') fail(CODES.WORKSPACE_FORBIDDEN, 'Active membership is required.');
    return { workspace, authority: 'ORGANIZATION_MEMBER', member: member.data() };
  }
  fail(CODES.WORKSPACE_FORBIDDEN, 'Unsupported workspace type.');
}

async function assertCanAccessUser(db, workspaceId, workspace, userId) {
  if (workspace.type === 'PERSONAL') return workspace.ownerUserId === userId;
  const member = await db.doc(`organizations/${workspace.organizationId}/members/${userId}`).get();
  return member.exists && member.data().status === 'ACTIVE';
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export async function executeChatCommand(db, { userId, command }) {
  if (!userId) fail(CODES.UNAUTHENTICATED, 'Authentication required.');
  const envelope = validateChatCommand(command);
  if (!envelope.valid) fail(envelope.code || CODES.COMMAND_INVALID, envelope.errors.join('; '));

  const { workspaceId } = command.payload;
  const { workspace } = await loadWorkspaceMemberOrOwner(db, workspaceId, userId);
  const fingerprint = computeOperationFingerprint(userId, command);
  const opRef = operationDoc(db, workspaceId, command.operationId);

  const peek = await peekCompletedOperation(db, { workspaceId, operationId: command.operationId, userId, fingerprint, fail, codes: CODES });
  if (peek) {
    // Journal already committed — rehydrate the recorded outcome for callers.
    const opSnap = await opRef.get();
    if (opSnap.exists) return { idempotent: true, operationId: command.operationId, ...opSnap.data() };
    return { idempotent: true, operationId: command.operationId, ...peek };
  }

  const now = new Date().toISOString();
  const actor = { actorType: 'USER', actorId: userId };

  const result = await db.runTransaction(async (transaction) => {
    // ALL reads before ALL writes (Firestore hard rule). Preload anything a
    // handler might need — the opRef, the conversation if targeted, plus the
    // referenced context object for CREATE_CONTEXT_CONVERSATION.
    const opSnap = await transaction.get(opRef);

    let preloadConv = null;
    const needsConversation = ['POST_MESSAGE', 'MARK_READ', 'ARCHIVE_CONVERSATION', 'CREATE_CONTEXT_CONVERSATION', 'CREATE_DIRECT_CONVERSATION', 'ROOM_ADD_MEMBER', 'ROOM_REMOVE_MEMBER'].includes(command.commandType);
    if (needsConversation) {
      let convId = command.payload.conversationId || null;
      if (command.commandType === 'CREATE_DIRECT_CONVERSATION') convId = directConversationId(userId, command.payload.targetUserId);
      if (command.commandType === 'CREATE_CONTEXT_CONVERSATION' && command.payload.contextReference) {
        const check = validateContextReference(command.payload.contextReference);
        if (check.valid) convId = contextConversationId(check.value);
      }
      if (convId) {
        const convRef = db.doc(`workspaces/${workspaceId}/conversations/${convId}`);
        preloadConv = { convId, snap: await transaction.get(convRef) };
      }
    }
    let preloadCtx = null;
    if (command.commandType === 'CREATE_CONTEXT_CONVERSATION' && command.payload.contextReference) {
      const check = validateContextReference(command.payload.contextReference);
      if (check.valid) {
        const ref = check.value;
        const collectionName = ref.type === 'RECORD' ? 'records' : ref.type === 'ENTITY' ? 'entities' : 'modules';
        preloadCtx = await transaction.get(db.doc(`workspaces/${workspaceId}/${collectionName}/${ref.id}`));
      }
    }
    // Group invites resolve server-side BEFORE any writes.
    let preloadGroups = [];
    if (command.commandType === 'CREATE_ROOM_CONVERSATION' && Array.isArray(command.payload.groupIds) && command.payload.groupIds.length) {
      if (workspace.type !== 'ORGANIZATION' || !workspace.organizationId) {
        fail(CODES.CONTEXT_FORBIDDEN, 'Group invitation is only available in organization workspaces.');
      }
      for (const groupId of command.payload.groupIds) {
        const groupSnap = await transaction.get(db.doc(`organizations/${workspace.organizationId}/groups/${groupId}`));
        preloadGroups.push({ groupId, snap: groupSnap });
      }
    }
    let preloadRead = null;
    if (command.commandType === 'MARK_READ' && preloadConv?.snap?.exists) {
      preloadRead = await transaction.get(db.doc(`workspaces/${workspaceId}/conversations/${preloadConv.convId}/readStates/${userId}`));
    }

    if (opSnap.exists) {
      const op = opSnap.data();
      if (op.userId !== userId || op.workspaceId !== workspaceId) fail(CODES.OPERATION_CONFLICT, 'Operation identity mismatch.');
      if (op.fingerprint !== fingerprint) fail(CODES.OPERATION_MISMATCH, 'Operation command mismatch.');
      if (op.status === OPERATION_STATUS.COMPLETED) return { replay: true, stored: op.result || null };
      if (op.status === OPERATION_STATUS.FAILED) fail(CODES.OPERATION_CONFLICT, 'Operation exists with terminal or failed status.');
      const leaseExpired = !op.leaseExpiresAt || op.leaseExpiresAt.toMillis() <= Timestamp.now().toMillis();
      if (!leaseExpired) return { inProgress: true };
      const attemptCount = (op.attemptCount || 1) + 1;
      if (attemptCount > MAX_RECOVERY_ATTEMPTS) fail(CODES.OPERATION_CONFLICT, 'Operation recovery limit exceeded.');
      transaction.update(opRef, { status: OPERATION_STATUS.PROCESSING, attemptCount, leaseExpiresAt: Timestamp.fromMillis(Timestamp.now().toMillis() + OPERATION_LEASE_MS), updatedAt: FieldValue.serverTimestamp() });
    } else {
      transaction.set(opRef, buildOperationDocument({ command, userId, fingerprint, status: OPERATION_STATUS.PROCESSING }));
    }

    const outcome = await executeChatMutation(transaction, db, {
      userId, command, now, actor, workspace, workspaceId,
      preloadConv, preloadCtx, preloadRead, preloadGroups,
    });

    transaction.update(opRef, {
      status: OPERATION_STATUS.COMPLETED,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      result: outcome.result ?? null,
    });
    return outcome;
  });

  if (result.inProgress) fail(CODES.OPERATION_CONFLICT, 'The same operation is already in progress.');
  if (result.replay) return { idempotent: true, operationId: command.operationId, ...result.stored };

  // POST_MESSAGE side effects: deterministic, derived notifications AFTER
  // the canonical commit. Same operationId cannot retry into a duplicate
  // because the notification ids embed the journal operationId.
  try {
    await runChatPostActions(db, workspaceId, result);
  } catch { /* notifications are best-effort; logged downstream */ }

  return { idempotent: false, operationId: command.operationId, ...(result.result ? { result: result.result } : {}) };
}

async function executeChatMutation(transaction, db, ctx) {
  const { command } = ctx;
  switch (command.commandType) {
    case CHAT_COMMAND_TYPES.CREATE_DIRECT_CONVERSATION: return createDirectConversation(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.CREATE_CHANNEL: return createChannel(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.CREATE_CONTEXT_CONVERSATION: return createContextConversation(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.CREATE_ROOM_CONVERSATION: return createRoomConversation(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.ROOM_ADD_MEMBER: return roomAddMember(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.ROOM_REMOVE_MEMBER: return roomRemoveMember(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.POST_MESSAGE: return postMessage(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.MARK_READ: return markRead(transaction, db, ctx);
    case CHAT_COMMAND_TYPES.ARCHIVE_CONVERSATION: return archiveConversation(transaction, db, ctx);
    default:
      fail(CODES.UNSUPPORTED_COMMAND, `Unknown Chat command: ${command.commandType}`);
  }
}

async function createDirectConversation(transaction, db, { command, userId, now, actor, workspace, workspaceId, preloadConv }) {
  const p = command.payload;
  if (!(await assertCanAccessUser(db, workspaceId, workspace, p.targetUserId))) fail(CODES.CONTEXT_FORBIDDEN, 'Target user is not an active workspace member.');
  const conversationId = preloadConv?.convId || directConversationId(userId, p.targetUserId);
  if (preloadConv?.snap?.exists) return { result: { conversationId, existing: true } };
  const conv = createConversation({
    conversationId,
    workspaceId,
    type: 'DIRECT',
    memberIds: [userId, p.targetUserId],
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}`), { ...conv, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  for (const memberId of [userId, p.targetUserId]) {
    transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}/members/${memberId}`), {
      conversationId, workspaceId, userId: memberId, role: memberId === userId ? 'OWNER' : 'MEMBER', _joinedAt: FieldValue.serverTimestamp(),
    });
  }
  return { result: { conversationId } };
}

async function createChannel(transaction, db, { command, userId, now, actor, workspaceId, workspace }) {
  const p = command.payload;
  if (!p.title?.trim()) fail(CODES.COMMAND_INVALID, 'Channel title is required.');
  const memberIds = p.memberIds && Array.isArray(p.memberIds) ? [...new Set([userId, ...p.memberIds]).values()] : [userId];
  for (const memberId of memberIds) {
    if (!(await assertCanAccessUser(db, workspaceId, workspace, memberId))) fail(CODES.CONTEXT_FORBIDDEN, `Member not active in workspace: ${memberId}`);
  }
  const conversationId = newId('ch');
  const ref = db.doc(`workspaces/${workspaceId}/conversations/${conversationId}`);
  const conv = createConversation({
    conversationId,
    workspaceId,
    type: 'GROUP',
    title: p.title.trim(),
    memberIds,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  transaction.set(ref, { ...conv, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  for (const memberId of memberIds) {
    transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}/members/${memberId}`), {
      conversationId, workspaceId, userId: memberId, role: memberId === userId ? 'OWNER' : 'MEMBER', _joinedAt: FieldValue.serverTimestamp(),
    });
  }
  return { result: { conversationId } };
}

async function createContextConversation(transaction, db, { command, userId, now, actor, workspaceId, preloadCtx, preloadConv }) {
  const p = command.payload;
  const refCheck = validateContextReference(p.contextReference);
  if (!refCheck.valid) fail(CODES.CONTEXT_NOT_FOUND, `Invalid contextReference: ${refCheck.errors.join('; ')}`);
  const reference = refCheck.value;
  if (reference.workspaceId !== workspaceId) fail(CODES.WORKSPACE_FORBIDDEN, 'contextReference must be in the same Workspace.');

  if (!preloadCtx?.exists) fail(CODES.CONTEXT_NOT_FOUND, 'Referenced object does not exist.');

  const conversationId = preloadConv?.convId || contextConversationId(reference);
  if (preloadConv?.snap?.exists) return { result: { conversationId, existing: true } };
  const conv = createConversation({
    conversationId,
    workspaceId,
    type: 'CONTEXT',
    title: '',
    memberIds: [userId],
    contextReference: reference,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}`), { ...conv, _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}/members/${userId}`), {
    conversationId, workspaceId, userId, role: 'OWNER', _joinedAt: FieldValue.serverTimestamp(),
  });
  return { result: { conversationId } };
}

async function createRoomConversation(transaction, db, { command, userId, now, actor, workspace, workspaceId, preloadGroups }) {
  const p = command.payload;
  // Resolve invited Groups server-side (never trust client expansion).
  const invitedMemberIds = new Set([userId]);
  const invitedGroups = [];
  for (const offered of preloadGroups) {
    if (!offered.snap.exists) fail(CODES.CONTEXT_NOT_FOUND, `Group not found: ${offered.groupId}`);
    const group = offered.snap.data();
    if (group.organizationId !== workspace.organizationId) fail(CODES.WORKSPACE_FORBIDDEN, 'Group must belong to the same organization.');
    invitedGroups.push({ groupId: group.groupId, name: group.name });
    for (const memberId of (group.memberIds || [])) invitedMemberIds.add(memberId);
  }
  for (const requested of (p.memberIds || [])) invitedMemberIds.add(requested);

  // Every invited user must be an active workspace member.
  for (const memberId of invitedMemberIds) {
    if (!(await assertCanAccessUser(db, workspaceId, workspace, memberId))) {
      fail(CODES.CONTEXT_FORBIDDEN, `Invited member is not active in this workspace: ${memberId}`);
    }
  }

  const conversationId = newId('room');
  const ref = db.doc(`workspaces/${workspaceId}/conversations/${conversationId}`);
  const conv = createConversation({
    conversationId,
    workspaceId,
    type: 'ROOM',
    title: p.topic.trim(),
    memberIds: [...invitedMemberIds],
    visibility: p.visibility,
    ownerUserId: userId,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
  });
  transaction.set(ref, { ...conv, description: String(p.description || '').trim(), _createdAt: FieldValue.serverTimestamp(), _updatedAt: FieldValue.serverTimestamp() });
  for (const memberId of [userId]) {
    transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${conversationId}/members/${memberId}`), {
      conversationId, workspaceId, userId: memberId, role: 'OWNER', _joinedAt: FieldValue.serverTimestamp(),
    });
  }
  return { result: { conversationId, memberCount: invitedMemberIds.size }, postActions: { room: conv, invitedGroups, invitedMemberIds: [...invitedMemberIds], operationId: command.operationId, userId } };
}

async function roomAddMember(transaction, db, { command, userId, workspaceId, preloadConv }) {
  const p = command.payload;
  if (!preloadConv?.snap?.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Room not found.');
  const conversation = preloadConv.snap.data();
  if (conversation.type !== 'ROOM') fail(CODES.CONTEXT_FORBIDDEN, 'This operation is only allowed for Rooms.');
  if (conversation.ownerUserId !== userId) fail(CODES.CONTEXT_FORBIDDEN, 'Only the Room owner can manage participants.');
  if (conversation.status === 'ARCHIVED') fail(CODES.INVALID_STATE, 'Archived Room cannot be modified.');
  const memberIds = (conversation.memberIds || []).includes(p.targetUserId) ? conversation.memberIds || [] : [...conversation.memberIds, p.targetUserId];
  transaction.update(db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}`), {
    memberIds,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.set(db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}/members/${p.targetUserId}`), {
    conversationId: p.conversationId, workspaceId, userId: p.targetUserId, role: 'MEMBER', _joinedAt: FieldValue.serverTimestamp(),
  });
  return { result: { conversationId: p.conversationId, targetUserId: p.targetUserId, added: true } };
}

async function roomRemoveMember(transaction, db, { command, userId, workspaceId, preloadConv }) {
  const p = command.payload;
  if (!preloadConv?.snap?.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Room not found.');
  const conversation = preloadConv.snap.data();
  if (conversation.type !== 'ROOM') fail(CODES.CONTEXT_FORBIDDEN, 'This operation is only allowed for Rooms.');
  if (conversation.ownerUserId !== userId) fail(CODES.CONTEXT_FORBIDDEN, 'Only the Room owner can manage participants.');
  if (p.targetUserId === conversation.ownerUserId) fail(CODES.COMMAND_INVALID, 'Room owner cannot be removed as participant.');
  const remaining = (conversation.memberIds || []).filter((id) => id !== p.targetUserId);
  transaction.update(db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}`), {
    memberIds: remaining,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.delete(db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}/members/${p.targetUserId}`));
  return { result: { conversationId: p.conversationId, targetUserId: p.targetUserId, removed: true } };
}

async function postMessage(transaction, db, { command, userId, now, workspaceId, preloadConv }) {
  const p = command.payload;
  if (!preloadConv?.snap?.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Conversation not found.');
  const conversation = preloadConv.snap.data();
  if (conversation.workspaceId !== workspaceId) fail(CODES.WORKSPACE_FORBIDDEN, 'Conversation workspace mismatch.');
  if (!(conversation.memberIds || []).includes(userId) && conversation.type !== 'CONTEXT') fail(CODES.NOT_MEMBER, 'You are not a member of this Conversation.');
  if (conversation.status === 'ARCHIVED') fail(CODES.INVALID_STATE, 'Archived conversations cannot receive messages.');

  const messageId = newId('msg');
  const message = createMessage({
    messageId,
    conversationId: p.conversationId,
    workspaceId,
    senderUserId: userId,
    content: p.content,
    createdAt: now,
    replyToMessageId: p.replyToMessageId || null,
    mentionedUserIds: p.mentionedUserIds || [],
    objectReferences: p.objectReferences || [],
  });
  const messageRef = db.doc(`workspaces/${workspaceId}/${'conversations'}/${p.conversationId}/messages/${messageId}`);
  transaction.set(messageRef, { ...message, _createdAt: FieldValue.serverTimestamp() });
  transaction.update(db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}`), { _updatedAt: FieldValue.serverTimestamp(), lastMessageAt: FieldValue.serverTimestamp() });

  return { result: { messageId, conversationId: p.conversationId }, postActions: { conversation, p, userId, operationId: command.operationId } };
}

async function markRead(transaction, db, { command, userId, now, workspaceId, preloadConv, preloadRead }) {
  const p = command.payload;
  if (!preloadConv?.snap?.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Conversation not found.');
  const conversation = preloadConv.snap.data();
  if (!(conversation.memberIds || []).includes(userId) && conversation.type !== 'CONTEXT') fail(CODES.NOT_MEMBER, 'You are not a member of this Conversation.');
  const readRef = db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}/readStates/${userId}`);
  const previous = preloadRead?.exists ? preloadRead.data() : null;
  if (previous?.lastReadAt && now <= previous.lastReadAt) {
    return { result: { readStateId: `read_${p.conversationId}_${userId}`, idempotentNote: 'already-newer' } };
  }
  transaction.set(readRef, {
    workspaceId,
    conversationId: p.conversationId,
    userId,
    lastReadAt: now,
    lastReadMessageId: p.lastReadMessageId || null,
    _updatedAt: FieldValue.serverTimestamp(),
  });
  return { result: { readStateId: `read_${p.conversationId}_${userId}` } };
}

async function archiveConversation(transaction, db, { command, workspaceId, preloadConv }) {
  const p = command.payload;
  if (!preloadConv?.snap?.exists) fail(CODES.RESOURCE_NOT_FOUND, 'Conversation not found.');
  const ref = db.doc(`workspaces/${workspaceId}/conversations/${p.conversationId}`);
  if (preloadConv.snap.data().status === 'ARCHIVED') return { result: { conversationId: p.conversationId }, idempotentNoop: true };
  transaction.update(ref, { status: 'ARCHIVED', _updatedAt: FieldValue.serverTimestamp() });
  return { result: { conversationId: p.conversationId } };
}

/**
 * Called AFTER the transaction commits — notifications are derived, never
 * part of the canonical mutation. Failures are non-blocking.
 */
export async function runChatPostActions(db, workspaceId, outcome) {
  if (!outcome?.postActions) return;
  const { conversation, room, invitedMemberIds, p, userId, operationId } = outcome.postActions;

  // Room invites (deterministic by room + recipient; a replayed CREATE_ROOM
  // operation can never duplicate a notification).
  if (room && Array.isArray(invitedMemberIds) && invitedMemberIds.length > 1) {
    try {
      for (const recipient of invitedMemberIds.filter((id) => id !== userId)) {
        await processNotificationIntent(db, {
          eventType: NOTIFICATION_EVENT_TYPES.CHAT_ROOM_INVITED,
          workspaceId,
          actorUserId: userId,
          operationId: `${operationId}:room-inv:${recipient}`,
          recipientStrategy: { type: 'EXPLICIT_USER', userId: recipient },
          excludeActorRecipient: true,
          contextReference: { type: 'RECORD', id: room.conversationId, workspaceId },
        });
      }
    } catch { /* best effort */ }
    return;
  }

  const isContext = conversation.type === 'CONTEXT';
  const isDirect = conversation.type === 'DIRECT';
  const mentioned = (p.mentionedUserIds || []).filter((id) => id !== userId);
  const otherMembers = (conversation.memberIds || []).filter((id) => id !== userId);

  const baseReference = isContext && conversation.contextReference
    ? conversation.contextReference
    : { type: 'RECORD', id: p.conversationId, workspaceId };

  try {
    if (isDirect) {
      for (const recipient of otherMembers) {
        await processNotificationIntent(db, {
          eventType: NOTIFICATION_EVENT_TYPES.CHAT_DIRECT_MESSAGE,
          workspaceId,
          actorUserId: userId,
          operationId: `${operationId}:${recipient}`,
          recipientStrategy: { type: 'EXPLICIT_USER', userId: recipient },
          excludeActorRecipient: true,
          contextReference: baseReference,
        });
      }
    }
    if (mentioned.length) {
      for (const recipient of mentioned) {
        await processNotificationIntent(db, {
          eventType: NOTIFICATION_EVENT_TYPES.CHAT_MENTIONED,
          workspaceId,
          actorUserId: userId,
          operationId: `${operationId}:mention:${recipient}`,
          recipientStrategy: { type: 'EXPLICIT_USER', userId: recipient },
          excludeActorRecipient: true,
          contextReference: baseReference,
        });
      }
    }
  } catch {
    // best-effort by design
  }
}
