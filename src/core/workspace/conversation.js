export const CONVERSATION_TYPES = Object.freeze({ DIRECT: 'DIRECT', GROUP: 'GROUP' });
export const CONVERSATION_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' });

export function createConversation({
  conversationId, workspaceId, type, title = '', memberIds, createdBy,
  status = CONVERSATION_STATUSES.ACTIVE, createdAt = null, updatedAt = null,
}) {
  if (!conversationId || !workspaceId) throw new Error('Conversation identity is required');
  if (!Object.values(CONVERSATION_TYPES).includes(type)) throw new Error('Invalid Conversation type');
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > 50) throw new Error('Conversation requires 1–50 members');
  const uniqueMembers = [...new Set(memberIds)];
  if (type === CONVERSATION_TYPES.DIRECT && uniqueMembers.length !== 2) throw new Error('Direct conversation requires exactly two members');
  if (!createdBy?.actorId || !uniqueMembers.includes(createdBy.actorId)) throw new Error('Conversation creator must be a member');
  return Object.freeze({ conversationId, workspaceId, type, title: title.trim(), memberIds: Object.freeze(uniqueMembers), status, createdBy: Object.freeze({ ...createdBy }), createdAt, updatedAt });
}

export function createConversationMember({ conversationId, workspaceId, userId, role = 'MEMBER', joinedAt = null }) {
  if (!conversationId || !workspaceId || !userId) throw new Error('ConversationMember identity is required');
  return Object.freeze({ conversationId, workspaceId, userId, role, joinedAt });
}

export function createMessage({ messageId, conversationId, workspaceId, senderUserId, content, createdAt = null }) {
  if (!messageId || !conversationId || !workspaceId || !senderUserId) throw new Error('Message identity is required');
  if (!content?.trim() || content.trim().length > 4000) throw new Error('Message content must be 1–4000 characters');
  return Object.freeze({ messageId, conversationId, workspaceId, senderUserId, content: content.trim(), createdAt });
}
