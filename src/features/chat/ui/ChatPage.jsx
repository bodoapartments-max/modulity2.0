import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

export default function ChatPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState(null);
  const [content, setContent] = useState('');
  const loader = useCallback(async () => {
    try {
      return await services.conversation.listForUser(workspaceId, userId, 25);
    } catch (queryError) {
      if (import.meta.env.DEV) console.error('[ChatPage] conversation query failed', queryError);
      throw queryError;
    }
  }, [workspaceId, userId]);
  const { data: conversations = [], error, initialLoading } = useWorkspaceQuery({
    workspaceId, resource: 'conversations', params: { userId, page: 'first' }, loader, enabled: Boolean(workspaceId && userId), ttlMs: 15000,
  });

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) { setMessages([]); return; }
    try {
      setMessageLoading(true);
      setMessageError(null);
      const result = await services.conversation.listMessages(workspaceId, conversationId, userId, { pageSize: 30 });
      setMessages(result.items);
    } catch {
      setMessageError('Messages could not be loaded.');
    } finally {
      setMessageLoading(false);
    }
  }, [workspaceId, userId]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0].conversationId);
  }, [conversations, selectedId]);
  useEffect(() => { loadMessages(selectedId); }, [selectedId, loadMessages]);

  async function send(event) {
    event.preventDefault();
    if (!content.trim() || !selectedId) return;
    try {
      await services.conversation.sendMessage({ workspaceId, conversationId: selectedId, senderUserId: userId, content });
      setContent('');
      await loadMessages(selectedId);
    } catch {
      setMessageError('Message could not be sent.');
    }
  }

  if (workspaceLoading || initialLoading) return <PageContainer><LoadingState message="Loading conversations..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available workspace before opening Chat." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message="Conversations could not be loaded." /></PageContainer>;

  return <PageContainer><PageHeader title="Chat" description="Workspace conversations with bounded message history." />
    {conversations.length === 0 ? <EmptyState title="No conversations" description="Conversation creation and member selection are intentionally deferred; existing workspace conversations will appear here." /> : <div className="grid min-h-96 gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">{conversations.map((conversation) => <button key={conversation.conversationId} type="button" className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedId === conversation.conversationId ? 'bg-primary-50 text-primary-800' : 'hover:bg-neutral-50'}`} onClick={() => setSelectedId(conversation.conversationId)}>{conversation.title || (conversation.type === 'DIRECT' ? 'Direct conversation' : 'Group conversation')}</button>)}</aside>
      <section className="flex min-w-0 flex-col rounded-lg border border-neutral-200 bg-white p-4">{messageError && <ErrorState message={messageError} />}{messageLoading ? <LoadingState message="Loading messages..." /> : messages.length === 0 ? <EmptyState title="No messages" description="Start this conversation." /> : <div className="flex-1 space-y-3 overflow-y-auto">{[...messages].reverse().map((message) => <div key={message.messageId} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.senderUserId === userId ? 'ml-auto bg-primary-50' : 'bg-neutral-100'}`}><p>{message.content}</p><span className="mt-1 block text-xs text-neutral-400">{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Sending…'}</span></div>)}</div>}
        <form className="mt-4 flex gap-2" onSubmit={send}><Input id="chat-message" name="message" aria-label="Message" value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} placeholder="Write a message" /><Button type="submit">Send</Button></form></section>
    </div>}
  </PageContainer>;
}
