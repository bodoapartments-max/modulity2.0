import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Dialog, useToast } from '../../../design-system/index.js';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

function ContextBadges({ conversation }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      conversation.type === 'DIRECT' ? 'bg-blue-50 text-blue-700'
      : conversation.type === 'GROUP' ? 'bg-emerald-50 text-emerald-700'
      : conversation.type === 'CONTEXT' ? 'bg-amber-50 text-amber-700'
      : 'bg-neutral-100 text-neutral-600'
    }`}>{conversation.type}</span>
  );
}

export default function ChatPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const { user } = useAuth();
  const userId = user?.userId || user?.uid;
  const workspaceId = currentWorkspace?.workspaceId;
  const [searchParams] = useSearchParams();

  const requestedConversationId = searchParams.get('c');
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState(requestedConversationId || null);
  const [messages, setMessages] = useState([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState(null);
  const [content, setContent] = useState('');
  const [directOpen, setDirectOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [channelTitle, setChannelTitle] = useState('');
  const [channelMembers, setChannelMembers] = useState([]);
  const [members, setMembers] = useState([]);

  const loader = useCallback(async () => {
    try {
      return await services.conversation.listForUser(workspaceId, userId, 50);
    } catch (loaderError) {
      // eslint-disable-next-line no-console
      console.error('[chat-debug] loader failed:', loaderError?.code, loaderError?.message);
      throw loaderError;
    }
  }, [workspaceId, userId]);
  const { data: conversations = [], error, initialLoading, refresh: refreshConversations } = useWorkspaceQuery({
    workspaceId, resource: 'conversations', params: { userId }, loader, enabled: Boolean(workspaceId && userId),
  });

  useEffect(() => {
    async function loadMembers() {
      if (!currentWorkspace?.organizationId) {
        // Personal workspaces have exactly the owner as member; DM is self-loop only if configured that way later.
        setMembers([]);
        return;
      }
      if (!services?.membership?.getOrganizationMembers) { setMembers([]); return; }
      try {
        const rows = await services.membership.getOrganizationMembers(currentWorkspace.organizationId);
        setMembers(rows
          .filter((row) => (row.membership?.status ?? 'ACTIVE') === 'ACTIVE' && row.membership?.userId !== userId)
          .map((row) => ({
            userId: row.membership?.userId,
            displayName: row.person?.displayName || row.person?.firstName || row.membership?.userId,
          })));
      } catch { /* non-member or no perms — chat still works */ }
    }
    loadMembers();
  }, [currentWorkspace?.organizationId, userId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) { setMessages([]); return; }
    try {
      setMessageLoading(true);
      setMessageError(null);
      const result = await services.conversation.listMessages(workspaceId, conversationId, { pageSize: 50 });
      setMessages(result.items);
    } catch {
      setMessageError('Messages could not be loaded.');
    } finally {
      setMessageLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0].conversationId);
  }, [conversations, selectedId]);
  useEffect(() => { loadMessages(selectedId); }, [selectedId, loadMessages]);

  async function send(event) {
    event.preventDefault();
    if (!content.trim() || !selectedId) return;
    try {
      await services.conversation.sendMessage({ workspaceId, conversationId: selectedId, content });
      setContent('');
      await loadMessages(selectedId);
      await services.conversation.markRead({ workspaceId, conversationId: selectedId });
      await refreshConversations();
    } catch {
      setMessageError('Message could not be sent.');
    }
  }

  async function createDirect() {
    if (!selectedTargetId) return;
    try {
      const result = await services.conversation.createDirectConversation({ workspaceId, targetUserId: selectedTargetId });
      setDirectOpen(false);
      await refreshConversations();
      setSelectedId(result.result?.conversationId || result.conversationId);
    } catch (err) {
      showToast({ message: err.message || 'Direct conversation could not be started.', variant: 'error' });
    }
  }

  async function createChannel() {
    if (!channelTitle.trim()) return;
    try {
      const result = await services.conversation.createChannel({ workspaceId, title: channelTitle.trim(), memberIds: channelMembers });
      setChannelOpen(false);
      setChannelTitle('');
      setChannelMembers([]);
      await refreshConversations();
      setSelectedId(result.result?.conversationId || result.conversationId);
    } catch (err) {
      showToast({ message: err.message || 'Channel could not be created.', variant: 'error' });
    }
  }

  const isUnread = useCallback((conversation) => {
    const read = conversation.readState;
    if (!read) return conversation.lastMessageAt != null;
    const lastMsgTs = conversation.lastMessageAt || conversation.updatedAt;
    if (!lastMsgTs) return false;
    return new Date(lastMsgTs).getTime() > new Date(read.lastReadAt).getTime();
  }, []);

  const sortedConversations = useMemo(() =>
    [...conversations].sort((a, b) => String(b.lastMessageAt || b.updatedAt || '').localeCompare(String(a.lastMessageAt || a.updatedAt || ''))),
  [conversations]);

  if (workspaceLoading || initialLoading) return <PageContainer><LoadingState message="Loading conversations..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available workspace before opening Chat." /></PageContainer>;
  if (error) return <PageContainer><ErrorState message="Conversations could not be loaded." /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title="Chat"
        description="Direct, channel, and context conversations in this workspace."
        action={<div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setDirectOpen(true)}>New Direct</Button>
          <Button size="sm" variant="secondary" onClick={() => setChannelOpen(true)}>New Channel</Button>
        </div>}
      />
      {conversations.length === 0 ? (
        <EmptyState title="No conversations" description="Start a direct conversation or open one from a Record, Entity or Module." />
      ) : (
        <div className="grid min-h-96 gap-4 md:grid-cols-[16rem_1fr]">
          <aside className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">
            {sortedConversations.map((conversation) => (
              <button
                key={conversation.conversationId}
                type="button"
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedId === conversation.conversationId ? 'bg-primary-50 text-primary-800' : 'hover:bg-neutral-50'}`}
                onClick={() => setSelectedId(conversation.conversationId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {conversation.title || (conversation.type === 'DIRECT' ? 'Direct message' : conversation.type === 'CONTEXT' ? 'Context conversation' : 'Workspace channel')}
                  </span>
                  <ContextBadges conversation={conversation} />
                </div>
                {isUnread(conversation) && <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-primary-600" aria-label="unread" />}
              </button>
            ))}
          </aside>
          <section className="flex min-w-0 flex-col rounded-lg border border-neutral-200 bg-white p-4">
            {messageError && <ErrorState message={messageError} />}
            {messageLoading ? <LoadingState message="Loading messages..." /> : messages.length === 0 ? (
              <EmptyState title="No messages" description="Start this conversation." />
            ) : (
              <div className="flex-1 space-y-3 overflow-y-auto">
                {[...messages].reverse().map((message) => (
                  <div key={message.messageId} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.senderUserId === userId ? 'ml-auto bg-primary-50' : 'bg-neutral-100'}`}>
                    {message.replyToMessageId && <p className="mb-1 border-l-2 border-neutral-300 pl-2 text-xs text-neutral-500">Replying to earlier message</p>}
                    <p>{message.content}</p>
                    <span className="mt-1 block text-xs text-neutral-400">{message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Sending…'}</span>
                  </div>
                ))}
              </div>
            )}
            <form className="mt-4 flex gap-2" onSubmit={send}>
              <Input id="chat-message" name="message" aria-label="Message" value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} placeholder="Write a message" />
              <Button type="submit">Send</Button>
            </form>
          </section>
        </div>
      )}

      <Dialog open={directOpen} onClose={() => setDirectOpen(false)} title="New direct conversation">
        <p className="text-sm text-neutral-600 mb-3">Choose an active workspace member.</p>
        <ul className="space-y-1">
          {members.length === 0 && <li className="text-sm text-neutral-400">No other members available.</li>}
          {members.map((m) => (
            <li key={m.userId}>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="dm-target" checked={selectedTargetId === m.userId} onChange={() => setSelectedTargetId(m.userId)} />{m.displayName || m.email || m.userId}</label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDirectOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!selectedTargetId} onClick={createDirect}>Start</Button>
        </div>
      </Dialog>

      <Dialog open={channelOpen} onClose={() => setChannelOpen(false)} title="New channel">
        <Input label="Channel name" id="channel-title" value={channelTitle} onChange={(e) => setChannelTitle(e.target.value)} placeholder="e.g. Front Office" />
        <p className="mt-3 mb-1 text-xs font-semibold text-neutral-500">Members</p>
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.userId}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={channelMembers.includes(m.userId)} onChange={(event) => setChannelMembers((current) => event.target.checked ? [...current, m.userId] : current.filter((id) => id !== m.userId))} />
                {m.displayName || m.email || m.userId}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setChannelOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!channelTitle.trim()} onClick={createChannel}>Create</Button>
        </div>
      </Dialog>
    </PageContainer>
  );
}
