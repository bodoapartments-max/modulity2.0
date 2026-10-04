/**
 * Chat service — trusted command writes, repo reads.
 *
 * The trusted boundary owns: conversation/member/message creation, read-state
 * updates, notifications. Everything else (list/read) stays on Firestore.
 */
import { generateId } from '../utils/generateId.js';
import { contextConversationId } from '../chat/chatDomain.js';
import { createConversation, createConversationMember, createMessage } from './conversation.js';

export function createConversationService({ conversationRepo, chatCommand = null, notificationService = null }) {
  void notificationService; // Step 18: notifications go through trusted engine side effects now

  async function execute(commandType, payload, opSeed = null) {
    if (!chatCommand) throw new Error('Chat requires the trusted command boundary.');
    return chatCommand.execute(commandType, payload, opSeed || generateId());
  }

  /**
   * Legacy API: repository-direct writes when the trusted boundary is absent
   * (dev/test shims only — production calls always carry chatCommand).
   */
  async function legacyCreate({ workspaceId, type, title, memberIds, actor }) {
    const value = createConversation({
      conversationId: generateId(), workspaceId, type, title, memberIds, createdBy: actor,
    });
    const members = value.memberIds.map((userId) => createConversationMember({ conversationId: value.conversationId, workspaceId, userId, role: userId === actor.actorId ? 'OWNER' : 'MEMBER' }));
    return conversationRepo.create(value, members);
  }

  async function legacySendMessage({ workspaceId, conversationId, senderUserId, content }) {
    return conversationRepo.createMessage(createMessage({
      messageId: generateId(), workspaceId, conversationId, senderUserId, content,
    }));
  }

  async function createDirectConversation({ workspaceId, targetUserId }) {
    return execute('CREATE_DIRECT_CONVERSATION', { workspaceId, targetUserId });
  }

  async function createChannel({ workspaceId, title, memberIds = [] }) {
    return execute('CREATE_CHANNEL', { workspaceId, title, memberIds });
  }

  async function getOrCreateContextConversation({ workspaceId, contextReference }) {
    return execute('CREATE_CONTEXT_CONVERSATION', { workspaceId, contextReference });
  }

  async function sendMessage({ workspaceId, conversationId, content, replyToMessageId = null, mentionedUserIds = [], objectReferences = [] }) {
    return execute('POST_MESSAGE', { workspaceId, conversationId, content, replyToMessageId, mentionedUserIds, objectReferences });
  }

  async function markRead({ workspaceId, conversationId, lastReadMessageId = null }) {
    return execute('MARK_READ', { workspaceId, conversationId, lastReadMessageId });
  }

  async function listForUser(workspaceId, userId, pageSize = 25) {
    const conversations = await conversationRepo.listForUser(workspaceId, userId, pageSize);
    if (!chatCommand) return conversations;
    const readStates = await conversationRepo.listReadStates(workspaceId, conversations.map((c) => c.conversationId), userId);
    return conversations.map((c) => ({ ...c, readState: readStates[c.conversationId] || null }));
  }

  function contextIdFor(reference) {
    return contextConversationId(reference);
  }

  return {
    createDirectConversation,
    createChannel,
    getOrCreateContextConversation,
    contextIdFor,
    sendMessage,
    markRead,
    listForUser,
    listMessages: conversationRepo.listMessages,
    get: conversationRepo.getById,
    // Legacy pre-Step 18 API shim: only present when the trusted command
    // boundary is absent (test/emulator/in-app validation harnesses).
    ...(chatCommand ? {} : {
      create: legacyCreate,
      sendMessage: legacySendMessage,
      listMessages: conversationRepo.listMessages,
    }),
  };
}
