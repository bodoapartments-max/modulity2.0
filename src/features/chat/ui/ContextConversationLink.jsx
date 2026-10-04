/**
 * ContextConversationLink — one-click open/create of the CONTEXT conversation
 * bound to a canonical business object (Record / Entity / Module).
 *
 * Lazy creation: the trusted CREATE_CONTEXT_CONVERSATION runs only when the
 * user opens it. No automatic conversation-spawning.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import Button from '../../../design-system/components/Button/Button.jsx';

export default function ContextConversationLink({ contextReference, label = 'Discuss' }) {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const workspaceId = currentWorkspace?.workspaceId;

  if (!workspaceId || !contextReference) return null;

  async function open() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await services.conversation.getOrCreateContextConversation({ workspaceId, contextReference });
      const conversationId = result.result?.conversationId || result.conversationId;
      navigate(`/app/chat?c=${conversationId}`);
    } catch (err) {
      setError(err.message || 'Could not open the conversation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={busy}>
        {label}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  );
}
