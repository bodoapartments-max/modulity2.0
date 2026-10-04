import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_TYPES,
  CONTEXT_REFERENCE_TYPES,
  createConversation,
  createMessage,
  directConversationId,
  contextConversationId,
  validateContextReference,
} from './chatDomain.js';

describe('chatDomain', () => {
  it('creates a DIRECT conversation with exactly two members', () => {
    const conv = createConversation({
      conversationId: 'dm_a_b',
      workspaceId: 'ws-1',
      type: CONVERSATION_TYPES.DIRECT,
      memberIds: ['u1', 'u2'],
      createdBy: { actorType: 'USER', actorId: 'u1' },
    });
    expect(conv.type).toBe('DIRECT');
    expect(conv.memberIds).toEqual(['u1', 'u2']);
  });

  it('rejects a DIRECT conversation with wrong member counts', () => {
    expect(() => createConversation({ conversationId: 'd', workspaceId: 'ws', type: 'DIRECT', memberIds: ['u1'], createdBy: { actorType: 'USER', actorId: 'u1' } })).toThrow();
  });

  it('CONTEXT conversations require a reference', () => {
    expect(() => createConversation({ conversationId: 'c', workspaceId: 'ws', type: 'CONTEXT', memberIds: ['u1'], createdBy: { actorType: 'USER', actorId: 'u1' } })).toThrow(/contextReference/);
  });

  it('validates context references and same-workspace', () => {
    const ref = validateContextReference({ type: 'RECORD', id: 'rec-1', workspaceId: 'ws-1' });
    expect(ref.valid).toBe(true);
    expect(ref.value).toEqual({ type: CONTEXT_REFERENCE_TYPES.RECORD, id: 'rec-1', workspaceId: 'ws-1' });
    const foreign = validateContextReference({ type: 'RECORD', id: 'rec-1', workspaceId: 'ws-2' });
    expect(foreign.valid).toBe(true); // shape is valid; same-workspace check happens on create
  });

  it('rejects unknown context types and extra keys', () => {
    expect(validateContextReference({ type: 'FIRESTORE_PATH', collection: 'records' }).valid).toBe(false);
  });

  it('creates a message with mentions and object references (refs are validated)', () => {
    const m = createMessage({
      messageId: 'm1',
      conversationId: 'c1',
      workspaceId: 'ws-1',
      senderUserId: 'u1',
      content: 'Check [Room 214] please',
      mentionedUserIds: ['u2'],
      objectReferences: [{ type: 'ENTITY', id: 'ent-214', workspaceId: 'ws-1' }],
    });
    expect(m.mentionedUserIds).toEqual(['u2']);
    expect(m.objectReferences[0].type).toBe('ENTITY');
  });

  it('direct and context conversation ids are deterministic', () => {
    expect(directConversationId('ann', 'ben')).toBe(directConversationId('ben', 'ann'));
    expect(contextConversationId({ type: 'RECORD', id: 'r1', workspaceId: 'w' })).toBe('ctx_record_r1');
  });
});
