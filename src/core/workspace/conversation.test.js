import { describe, expect, it, vi } from 'vitest';
import { createConversation, createMessage } from './conversation.js';
import { createConversationService } from './conversationService.js';

const actor = { actorType: 'USER', actorId: 'user-1' };

describe('Conversation domain', () => {
  it('creates a direct conversation with exactly two unique members', () => {
    const conversation = createConversation({ conversationId: 'c1', workspaceId: 'ws1', type: 'DIRECT', memberIds: ['user-1', 'user-2'], createdBy: actor });
    expect(conversation.memberIds).toEqual(['user-1', 'user-2']);
  });

  it('rejects invalid direct membership and non-member creator', () => {
    expect(() => createConversation({ conversationId: 'c1', workspaceId: 'ws1', type: 'DIRECT', memberIds: ['user-1'], createdBy: actor })).toThrow('exactly two');
    expect(() => createConversation({ conversationId: 'c1', workspaceId: 'ws1', type: 'GROUP', memberIds: ['user-2'], createdBy: actor })).toThrow('creator');
  });

  it('validates bounded message content', () => {
    expect(createMessage({ messageId: 'm1', conversationId: 'c1', workspaceId: 'ws1', senderUserId: 'user-1', content: ' Hello ' }).content).toBe('Hello');
    expect(() => createMessage({ messageId: 'm1', conversationId: 'c1', workspaceId: 'ws1', senderUserId: 'user-1', content: '' })).toThrow('1–4000');
  });
});

describe('Conversation service', () => {
  it('checks membership before sending or listing messages', async () => {
    const conversationRepo = { isMember: vi.fn().mockResolvedValue(false), createMessage: vi.fn(), listMessages: vi.fn() };
    const service = createConversationService({ conversationRepo });
    await expect(service.sendMessage({ workspaceId: 'ws1', conversationId: 'c1', senderUserId: 'user-1', content: 'Hi' })).rejects.toThrow('membership');
    await expect(service.listMessages('ws1', 'c1', 'user-1')).rejects.toThrow('membership');
    expect(conversationRepo.createMessage).not.toHaveBeenCalled();
  });
});
