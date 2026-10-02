import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter,
  writeBatch, setDoc, serverTimestamp,
} from 'firebase/firestore';

export function createFirestoreConversationRepository(db) {
  const conversationRef = (workspaceId, id) => doc(db, 'workspaces', workspaceId, 'conversations', id);
  const conversationsRef = (workspaceId) => collection(db, 'workspaces', workspaceId, 'conversations');
  const memberRef = (workspaceId, conversationId, userId) => doc(db, 'workspaces', workspaceId, 'conversations', conversationId, 'members', userId);
  const messagesRef = (workspaceId, conversationId) => collection(db, 'workspaces', workspaceId, 'conversations', conversationId, 'messages');
  const messageRef = (workspaceId, conversationId, messageId) => doc(db, 'workspaces', workspaceId, 'conversations', conversationId, 'messages', messageId);
  const mapTime = (value) => value?.toDate?.()?.toISOString?.() || null;

  async function create(conversation, members) {
    const batch = writeBatch(db);
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...data } = conversation;
    batch.set(conversationRef(conversation.workspaceId, conversation.conversationId), { ...data, _createdAt: serverTimestamp(), _updatedAt: serverTimestamp() });
    for (const member of members) {
      batch.set(memberRef(conversation.workspaceId, conversation.conversationId, member.userId), { ...member, _joinedAt: serverTimestamp() });
    }
    await batch.commit();
    return conversation;
  }

  async function getById(workspaceId, conversationId) {
    const snapshot = await getDoc(conversationRef(workspaceId, conversationId));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return { ...data, conversationId: snapshot.id, createdAt: mapTime(data._createdAt), updatedAt: mapTime(data._updatedAt) };
  }

  async function listForUser(workspaceId, userId, pageSize = 25) {
    const snapshot = await getDocs(query(conversationsRef(workspaceId), where('memberIds', 'array-contains', userId), orderBy('_updatedAt', 'desc'), limit(Math.min(pageSize, 50))));
    return snapshot.docs.map((item) => ({ ...item.data(), conversationId: item.id, createdAt: mapTime(item.data()._createdAt), updatedAt: mapTime(item.data()._updatedAt) }));
  }

  async function isMember(workspaceId, conversationId, userId) {
    return (await getDoc(memberRef(workspaceId, conversationId, userId))).exists();
  }

  async function createMessage(message) {
    const batch = writeBatch(db);
    const { createdAt: _createdAt, ...data } = message;
    batch.set(messageRef(message.workspaceId, message.conversationId, message.messageId), { ...data, _createdAt: serverTimestamp() });
    batch.update(conversationRef(message.workspaceId, message.conversationId), { _updatedAt: serverTimestamp() });
    await batch.commit();
    return message;
  }

  async function listMessages(workspaceId, conversationId, { pageSize = 30, cursor = null } = {}) {
    const constraints = [orderBy('_createdAt', 'desc'), limit(Math.min(pageSize, 50))];
    if (cursor) constraints.splice(1, 0, startAfter(cursor));
    const snapshot = await getDocs(query(messagesRef(workspaceId, conversationId), ...constraints));
    return {
      items: snapshot.docs.map((item) => ({ ...item.data(), messageId: item.id, createdAt: mapTime(item.data()._createdAt) })),
      nextCursor: snapshot.docs.at(-1) || null,
      hasMore: snapshot.size === Math.min(pageSize, 50),
    };
  }

  async function addMember(member) {
    await setDoc(memberRef(member.workspaceId, member.conversationId, member.userId), { ...member, _joinedAt: serverTimestamp() });
  }

  return { create, getById, listForUser, isMember, createMessage, listMessages, addMember };
}
