import { generateId } from '../utils/generateId.js';
import { createConversation, createConversationMember, createMessage } from './conversation.js';

export function createConversationService({ conversationRepo }) {
  async function create({ workspaceId, type, title, memberIds, actor }) {
    const conversationId = generateId();
    const conversation = createConversation({ conversationId, workspaceId, type, title, memberIds, createdBy: actor });
    const members = conversation.memberIds.map((userId) => createConversationMember({ conversationId, workspaceId, userId, role: userId === actor.actorId ? 'OWNER' : 'MEMBER' }));
    return conversationRepo.create(conversation, members);
  }

  async function sendMessage({ workspaceId, conversationId, senderUserId, content }) {
    if (!await conversationRepo.isMember(workspaceId, conversationId, senderUserId)) throw new Error('Conversation membership is required');
    return conversationRepo.createMessage(createMessage({ messageId: generateId(), workspaceId, conversationId, senderUserId, content }));
  }

  async function listMessages(workspaceId, conversationId, userId, options) {
    if (!await conversationRepo.isMember(workspaceId, conversationId, userId)) throw new Error('Conversation membership is required');
    return conversationRepo.listMessages(workspaceId, conversationId, options);
  }

  return {
    create,
    sendMessage,
    listMessages,
    listForUser: conversationRepo.listForUser,
    get: conversationRepo.getById,
  };
}
