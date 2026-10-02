import { useEffect, useRef, useState } from 'react';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Card from '../../../design-system/components/Card/Card.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import { automatApplyClient } from '../../../infrastructure/firebase/automatApplyClient.js';

const PHASE_LABELS = Object.freeze({ PREPARING: 'Preparing', ENTITY_TYPES: 'Creating Entity Types', MODULES: 'Creating Modules', WORKSETS: 'Creating Worksets', WIDGETS: 'Creating Widgets', REPORTS: 'Creating Reports', VERIFYING: 'Verifying configuration', COMPLETE: 'Complete' });

export default function AutomatApplyPanel({ workspace, persistedPlan }) {
  const [status, setStatus] = useState(persistedPlan.status);
  const [confirmation, setConfirmation] = useState('');
  const [operation, setOperation] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const phrase = `Apply this system plan to ${workspace.name}`;
  const summary = persistedPlan.summary || {};

  useEffect(() => () => window.clearInterval(pollRef.current), []);

  const approve = async () => {
    setError(null);
    setStatus('APPROVING');
    try {
      const approved = await automatApplyClient.approve({ workspaceId: workspace.workspaceId, planId: persistedPlan.planId, planFingerprint: persistedPlan.planFingerprint });
      setStatus(approved.status);
    } catch (approvalError) {
      setError(approvalError.message || 'Plan approval failed.');
      setStatus('READY_FOR_REVIEW');
    }
  };

  const apply = async () => {
    const operationId = crypto.randomUUID();
    setError(null);
    setStatus('APPLYING');
    setOperation({ operationId, phase: 'PREPARING', status: 'APPLYING' });
    let polls = 0;
    pollRef.current = window.setInterval(async () => {
      if (polls++ >= 300) return window.clearInterval(pollRef.current);
      try { setOperation(await automatApplyClient.status({ workspaceId: workspace.workspaceId, operationId })); } catch { setOperation((current) => current); }
    }, 1000);
    try {
      const applied = await automatApplyClient.apply({ workspaceId: workspace.workspaceId, planId: persistedPlan.planId, operationId });
      window.clearInterval(pollRef.current);
      setOperation(applied);
      setStatus(applied.status);
      workspaceQueryCache.invalidate(`${workspace.workspaceId}:`);
    } catch (applyError) {
      window.clearInterval(pollRef.current);
      setError(applyError.message || 'Plan application failed.');
      setStatus('FAILED');
      try { setOperation(await automatApplyClient.status({ workspaceId: workspace.workspaceId, operationId })); } catch { setOperation((current) => current); }
    }
  };

  return <Card className="border-primary-200">
    <h2 className="text-xl font-semibold text-neutral-900">Apply System Plan</h2>
    <p className="mt-1 text-sm text-neutral-600">The trusted application service will create or reuse canonical Workspace configuration. No destructive replacement is supported.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div>Create: {summary.CREATE || 0}</div><div>Reuse: {summary.REUSE || 0}</div><div>Safe update: {summary.SAFE_UPDATE || 0}</div><div>Conflicts: {summary.CONFLICT || 0}</div><div>Unsupported: {summary.UNSUPPORTED || 0}</div></div>
    {error && <Alert variant="error" className="mt-4">{error}</Alert>}
    {status === 'READY_FOR_REVIEW' && <div className="mt-4"><Button type="button" onClick={approve} disabled={(summary.CONFLICT || 0) > 0}>Approve Plan</Button></div>}
    {status === 'APPROVING' && <p className="mt-4 text-sm text-neutral-600" role="status">Approving the exact validated plan…</p>}
    {status === 'APPROVED' && <div className="mt-4 space-y-3"><Alert variant="warning">No destructive replacement will occur. Type-level relationship recommendations remain review-only.</Alert><div><Label htmlFor="automat-apply-confirmation">Type the confirmation phrase</Label><p className="mb-1 text-sm font-medium text-neutral-700">{phrase}</p><Input id="automat-apply-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div><Button type="button" onClick={apply} disabled={confirmation !== phrase}>Apply System Plan</Button></div>}
    {status === 'APPLYING' && <div className="mt-4" role="status"><p className="font-medium text-neutral-900">{PHASE_LABELS[operation?.phase] || 'Applying configuration'}</p><p className="text-sm text-neutral-600">Trusted operation: {operation?.operationId}</p></div>}
    {status === 'APPLIED' && <div className="mt-4 space-y-3"><Alert variant="success">System plan applied and verified. Created or reused {operation?.resourceResults?.filter((item) => item.status === 'SUCCESS').length || 0} resources.</Alert><div className="flex flex-wrap gap-2"><a href="/app/modules" className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">Open Modules</a><a href="/app/entity-types" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">Open Entity Types</a></div></div>}
    {status === 'FAILED' && <p className="mt-4 text-sm text-danger" role="alert">Application did not complete. Successful resources remain safe; retry uses the same operation journal.</p>}
  </Card>;
}
