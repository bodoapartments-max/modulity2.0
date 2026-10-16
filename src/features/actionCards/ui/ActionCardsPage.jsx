/**
 * ActionCardsPage — Step 31 reusable Action Card surface.
 *
 * Lists the OPEN ActionCard projections addressed to the current user in the
 * current workspace and executes the closed decision actions through the
 * trusted approvalCommand boundary.
 *
 * One operationId per user intent — a double-click or retry replays the
 * operation journal instead of duplicating effects. Resolved cards close
 * server-side; a stale/resolved decision surfaces as an explicit error and
 * the list refreshes.
 *
 * This is NOT the Step 42 Action Inbox — it is the minimum surface that
 * proves the reusable Action Card abstraction.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ActionCard from './ActionCard.jsx';
import { loadOpenActionCards, executeCardAction } from '../model.js';
import { generateId } from '../../../core/utils/generateId.js';

export default function ActionCardsPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const userId = user?.userId || user?.uid;

  const [state, setState] = useState('INITIAL_LOADING');
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyCardId, setBusyCardId] = useState(null);
  // One operationId per card decision — generated once per card so retries
  // converge on the journal instead of multiplying effects.
  const operationIds = useRef(new Map());

  const load = useCallback(async () => {
    if (!workspaceId || !userId) return;
    try {
      const result = await loadOpenActionCards({
        actionCardService: services.actionCard,
        workspaceId,
        userId,
      });
      setCards(result);
      setState('READY');
      setError(null);
    } catch (err) {
      setError(err.message || 'Action cards could not be loaded.');
      setState('ERROR');
    }
  }, [workspaceId, userId]);

  useEffect(() => { void load(); }, [load]);

  const handleAction = useCallback(async (card, action) => {
    if (busyCardId) return;
    setBusyCardId(card.actionCardId);
    setActionError(null);
    try {
      if (!operationIds.current.has(card.actionCardId)) {
        operationIds.current.set(card.actionCardId, generateId());
      }
      await executeCardAction({
        approvalCommand: services.approvalCommand,
        workspaceId,
        action,
        operationId: operationIds.current.get(card.actionCardId),
      });
      await load();
    } catch (err) {
      setActionError(err?.details?.message || err.message || 'The action could not be completed.');
      await load();
    } finally {
      setBusyCardId(null);
    }
  }, [busyCardId, workspaceId, load]);

  return (
    <PageContainer>
      <PageHeader title="Action Cards" subtitle="Items waiting for your action." />
      {actionError && <ErrorState message={actionError} />}
      {state === 'INITIAL_LOADING' && <LoadingState />}
      {state === 'ERROR' && <ErrorState message={error} />}
      {state === 'READY' && cards.length === 0 && (
        <EmptyState title="Nothing to do" message="You have no open action cards." />
      )}
      {state === 'READY' && cards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <ActionCard
              key={card.actionCardId}
              card={card}
              busy={busyCardId === card.actionCardId}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
