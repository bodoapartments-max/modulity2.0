/**
 * Modulity 2.0 — Chat Domain Model (canonical)
 *
 * CONVERSATION ≠ RECORD ≠ MESSAGE. Conversations reference business context;
 * they never become business objects themselves.
 *
 * Types:
 *   DIRECT    — exactly two workspace members (server determines membership)
 *   GROUP     — named conversation pinned by its member set
 *   WORKSPACE — broad workspace channel (all members can participate)
 *   CONTEXT   — bound to a canonical contextReference (RECORD/ENTITY/MODULE)
 *
 * Context references use the closed CONTRACT below — never arbitrary paths.
 * @module core/chat/chatDomain
 */

export const CONVERSATION_TYPES = Object.freeze({
  DIRECT: 'DIRECT',
  GROUP: 'GROUP',
  WORKSPACE: 'WORKSPACE',
  CONTEXT: 'CONTEXT',
});

export const CONVERSATION_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });

/**
 * Closed, versioned context reference v1 types.
 */
export const CONTEXT_REFERENCE_TYPES = Object.freeze({
  RECORD: 'RECORD',
  ENTITY: 'ENTITY',
  MODULE: 'MODULE',
});

export function validateContextReference(raw) {
  if (raw === undefined || raw === null) return { valid: true, value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['contextReference must be an object'] };
  }
  const errors = [];
  for (const key of Object.keys(raw)) {
    if (!['type', 'id', 'workspaceId'].includes(key)) errors.push(`contextReference.${key} is not supported`);
  }
  if (!CONTEXT_REFERENCE_TYPES[raw.type]) errors.push(`contextReference.type must be one of: ${Object.keys(CONTEXT_REFERENCE_TYPES).join(', ')}`);
  if (!raw.id || typeof raw.id !== 'string') errors.push('contextReference.id is required');
  if (!raw.workspaceId || typeof raw.workspaceId !== 'string') errors.push('contextReference.workspaceId is required');
  if (errors.length) return { valid: false, errors };
  return { valid: true, errors: [], value: Object.freeze({ type: raw.type, id: raw.id, workspaceId: raw.workspaceId }) };
}

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CONVERSATION_TITLE = 120;
export const MAX_CONVERSATION_MEMBERS = 100;
export const MAX_READ_LIST_PAGE = 50;
export const MAX_CONTEXT_REFERENCES_PER_MESSAGE = 4;

export function createConversation({
  conversationId,
  workspaceId,
  type,
  title = '',
  memberIds,
  createdBy,
  contextReference = null,
  status = CONVERSATION_STATUSES.ACTIVE,
  createdAt = null,
  updatedAt = null,
}) {
  if (!conversationId || !workspaceId) throw new Error('Conversation identity is required');
  if (!Object.values(CONVERSATION_TYPES).includes(type)) throw new Error('Invalid Conversation type');
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > MAX_CONVERSATION_MEMBERS) throw new Error('Conversation requires 1–100 members');
  const uniqueMembers = [...new Set(memberIds)];
  if (type === CONVERSATION_TYPES.DIRECT && uniqueMembers.length !== 2) throw new Error('Direct conversation requires exactly two members');
  if (type === CONVERSATION_TYPES.CONTEXT && !contextReference) throw new Error('Context conversations require a contextReference');
  if (type !== CONVERSATION_TYPES.CONTEXT && contextReference) throw new Error('Only CONTEXT conversations take a contextReference');
  if (contextReference) {
    const ref = validateContextReference(contextReference);
    if (!ref.valid) throw new Error(`contextReference is invalid: ${ref.errors.join('; ')}`);
    if (ref.value.workspaceId !== workspaceId) throw new Error('contextReference must be in the same Workspace');
    contextReference = ref.value;
  }
  if (!createdBy?.actorId) throw new Error('Conversation createdBy is required');
  if (type !== CONVERSATION_TYPES.WORKSPACE && !uniqueMembers.includes(createdBy.actorId)) throw new Error('Conversation creator must be a member');
  const trimmedTitle = String(title || '').trim();
  if (trimmedTitle.length > MAX_CONVERSATION_TITLE) throw new Error(`Title cannot exceed ${MAX_CONVERSATION_TITLE} characters`);
  return Object.freeze({
    conversationId,
    workspaceId,
    type,
    title: trimmedTitle,
    memberIds: Object.freeze(uniqueMembers),
    contextReference: contextReference ? Object.freeze({ ...contextReference }) : null,
    status,
    createdBy: Object.freeze({ ...createdBy }),
    createdAt,
    updatedAt,
  });
}

export function createConversationMember({ conversationId, workspaceId, userId, role = 'MEMBER', joinedAt = null }) {
  if (!conversationId || !workspaceId || !userId) throw new Error('ConversationMember identity is required');
  return Object.freeze({ conversationId, workspaceId, userId, role, joinedAt });
}

/**
 * Mentions: stable canonical users — never display text identity.
 * Server validates each mentioned id is an ACTIVE workspace member.
 */
export function createMessage({
  messageId,
  conversationId,
  workspaceId,
  senderUserId,
  content,
  createdAt = null,
  replyToMessageId = null,
  mentionedUserIds = [],
  objectReferences = [],
}) {
  if (!messageId || !conversationId || !workspaceId || !senderUserId) throw new Error('Message identity is required');
  const trimmed = String(content || '').trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) throw new Error(`Message content must be 1–${MAX_MESSAGE_LENGTH} characters`);
  if (replyToMessageId !== null && (typeof replyToMessageId !== 'string' || !replyToMessageId)) throw new Error('replyToMessageId must be a message id or null');
  if (!Array.isArray(mentionedUserIds)) throw new Error('mentionedUserIds must be an array');
  const mentions = [...new Set(mentionedUserIds)];
  const refs = (objectReferences || []).slice(0, MAX_CONTEXT_REFERENCES_PER_MESSAGE);
  const validatedRefs = refs.map((ref) => {
    const result = validateContextReference(ref);
    if (!result.valid) throw new Error(`objectReference is invalid: ${result.errors}`);
    return result.value;
  });
  return Object.freeze({
    messageId,
    conversationId,
    workspaceId,
    senderUserId,
    content: trimmed,
    createdAt,
    replyToMessageId,
    mentionedUserIds: Object.freeze(mentions),
    objectReferences: Object.freeze(validatedRefs),
  });
}

/** Deterministic conversation id for a DIRECT thread between two users. */
export function directConversationId(userA, userB) {
  return `dm_${[String(userA), String(userB)].sort().join('_')}`;
}

/** Deterministic conversation id for a canonical context reference. */
export function contextConversationId(workspaceReference) {
  return `ctx_${workspaceReference.type.toLowerCase()}_${workspaceReference.id}`;
}
