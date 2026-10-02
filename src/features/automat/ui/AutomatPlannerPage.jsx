import { useState } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import { automatPlanningService } from '../../../infrastructure/automatPlanning.js';
import { AUTOMAT_UI_STATES, createOrganizationInput, planningStateForStage } from '../model.js';
import AutomatPlanReview from './AutomatPlanReview.jsx';

export default function AutomatPlannerPage() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [state, setState] = useState(AUTOMAT_UI_STATES.IDLE);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const running = [AUTOMAT_UI_STATES.ANALYZING, AUTOMAT_UI_STATES.PLANNING, AUTOMAT_UI_STATES.VALIDATING].includes(state);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    try {
      const organizationInput = createOrganizationInput({ workspace: currentWorkspace, description, industry, country, employeeCount });
      setState(AUTOMAT_UI_STATES.ANALYZING);
      const next = await automatPlanningService.plan({ requestId: crypto.randomUUID(), workspace: currentWorkspace, userId: user.userId, organizationInput, onStage: (stage) => setState(planningStateForStage(stage)) });
      setResult(next);
      setState(AUTOMAT_UI_STATES.READY);
    } catch (planningError) {
      setError(planningError.message || 'System planning failed.');
      setState(AUTOMAT_UI_STATES.ERROR);
    }
  };

  return <PageContainer>
    <PageHeader title="Automat System Planner" description="Describe your organization and review a proposed Modulity operating system before anything is created." />
    <div className="space-y-5">
      <Alert variant="info">Planning uses a deterministic development knowledge provider. It reads bounded configuration summaries only and never changes this Workspace.</Alert>
      <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-neutral-500">Current Workspace</p><p className="font-semibold text-neutral-900">{currentWorkspace?.name || 'Workspace unavailable'}</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">Planning only</span></div></Card>
      <Card><form onSubmit={handleSubmit} className="space-y-4">
        <div><Label htmlFor="organization-description" required>Describe your organization</Label><textarea id="organization-description" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Example: I run a 40-room hotel with a restaurant, parking area, maintenance team and 18 employees." className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500" disabled={running} /></div>
        <div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="organization-industry">Industry (optional)</Label><Input id="organization-industry" value={industry} onChange={(event) => setIndustry(event.target.value)} disabled={running} /></div><div><Label htmlFor="organization-country">Country (optional)</Label><Input id="organization-country" value={country} onChange={(event) => setCountry(event.target.value)} disabled={running} /></div><div><Label htmlFor="organization-employees">Employee count (optional)</Label><Input id="organization-employees" type="number" min="0" value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} disabled={running} /></div></div>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" loading={running} disabled={!currentWorkspace || !description.trim() || running}>Build System Plan</Button>{running && <p className="text-sm text-neutral-600" role="status">{state === AUTOMAT_UI_STATES.ANALYZING ? 'Analyzing your organization…' : state === AUTOMAT_UI_STATES.VALIDATING ? 'Validating the proposed system…' : 'Planning business operations…'}</p>}</div>
      </form></Card>
      {error && <Alert variant="error">{error}</Alert>}
      {state === AUTOMAT_UI_STATES.READY && result && <AutomatPlanReview result={result} />}
    </div>
  </PageContainer>;
}
