import { useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { automatPlanningService } from '../../../agents/infrastructure/automatPlanning.js';
import { automatApplyClient } from '../../../infrastructure/firebase/automatApplyClient.js';
import { AUTOMAT_UI_STATES, planningStateForStage } from '../model.js';
import AutomatApplyPanel from './AutomatApplyPanel.jsx';
import AutomatPlanReview from './AutomatPlanReview.jsx';

export default function AutomatPlannerPage() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [description, setDescription] = useState('');
  const [state, setState] = useState(AUTOMAT_UI_STATES.IDLE);
  const [result, setResult] = useState(null);
  const [persistedPlan, setPersistedPlan] = useState(null);
  const [error, setError] = useState(null);

  const running = [AUTOMAT_UI_STATES.ANALYZING, AUTOMAT_UI_STATES.PLANNING, AUTOMAT_UI_STATES.VALIDATING].includes(state);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPersistedPlan(null);
    try {
      setState(AUTOMAT_UI_STATES.ANALYZING);
      const next = await automatPlanningService.evolve({ requestId: crypto.randomUUID(), workspace: currentWorkspace, userId: user.userId, businessRequest: description.trim(), onStage: (stage) => setState(planningStateForStage(stage)) });
      const persisted = !next.requiresClarification && next.validation.status !== 'INVALID' ? await automatApplyClient.persist({ workspaceId: currentWorkspace.workspaceId, plan: next.plan, planningFingerprint: next.configurationFingerprint }) : null;
      setResult(next);
      setPersistedPlan(persisted);
      setState(AUTOMAT_UI_STATES.READY);
    } catch (planningError) {
      setError(planningError.message || 'System planning failed.');
      setState(AUTOMAT_UI_STATES.ERROR);
    }
  };

  return <PageContainer>
    <PageHeader title="Automat Workspace Architect" description="Describe a new business need. Automat analyzes this Workspace, reuses existing capabilities, and proposes only what is missing." />
    <div className="space-y-5">
      <Alert variant="info">The Architect treats Workspace text as untrusted data, reads bounded configuration summaries, and applies nothing until deterministic validation and explicit approval.</Alert>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-neutral-500">Current Workspace</p><p className="font-semibold text-neutral-900">{currentWorkspace?.name || 'Workspace unavailable'}</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">Planning only</span></div></Card>
      <Card><form onSubmit={handleSubmit} className="space-y-4">
        <div><Label htmlFor="organization-description" required>What changed in your business?</Label><textarea id="organization-description" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Example: We opened a restaurant inside the hotel. Add table reservations, customer orders, suppliers and inventory." className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" disabled={running} /></div>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" loading={running} disabled={!currentWorkspace || !description.trim() || running}>Analyze Workspace Evolution</Button>{running && <p className="text-sm text-neutral-600" role="status">{state === AUTOMAT_UI_STATES.ANALYZING ? 'Analyzing your organization…' : state === AUTOMAT_UI_STATES.VALIDATING ? 'Validating the proposed system…' : 'Planning business operations…'}</p>}</div>
      </form></Card>
      {error && <Alert variant="error">{error}</Alert>}
      {state === AUTOMAT_UI_STATES.READY && result && <AutomatPlanReview result={result} />}
      {state === AUTOMAT_UI_STATES.READY && persistedPlan && <AutomatApplyPanel workspace={currentWorkspace} persistedPlan={persistedPlan} />}
    </div>
  </PageContainer>;
}
