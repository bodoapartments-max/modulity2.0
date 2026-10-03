import { useState } from 'react';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { workspaceResetClient } from '../../../infrastructure/firebase/workspaceResetClient.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import Card from '../../../design-system/components/Card/Card.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import Input from '../../../design-system/components/Input/Input.jsx';
import Label from '../../../design-system/components/Label/Label.jsx';
import Alert from '../../../design-system/components/Alert/Alert.jsx';
import { useToast } from '../../../design-system/components/Toast/ToastProvider.jsx';

export default function WorkspaceResetPanel() {
  const { currentWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [state, setState] = useState('IDLE');
  const [plan, setPlan] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  if (!currentWorkspace) return null;

  async function begin() {
    try {
      setState('PLANNING');
      setError(null);
      setPlan(await workspaceResetClient.plan(currentWorkspace.workspaceId));
      setState('CONFIRMING');
    } catch (planError) {
      setError(planError.message || 'Reset plan could not be created.');
      setState('ERROR');
    }
  }

  async function execute() {
    if (confirmation !== currentWorkspace.name || state === 'RESETTING') return;
    try {
      setState('RESETTING');
      setError(null);
      await workspaceResetClient.execute({ workspaceId: currentWorkspace.workspaceId, requestId: crypto.randomUUID(), confirmation });
      workspaceQueryCache.invalidate(`${currentWorkspace.workspaceId}:`);
      showToast({ message: 'Workspace reset completed. Reloading…', variant: 'success' });
      setState('SUCCESS');
      window.setTimeout(() => window.location.assign('/app'), 600);
    } catch (resetError) {
      setError(resetError.message || 'Workspace reset failed. It is safe to retry.');
      setState('ERROR');
    }
  }

  return <Card className="mt-8 max-w-2xl border-red-200 p-5"><h2 className="text-lg font-semibold text-red-800">Danger Zone</h2><p className="mt-2 text-sm text-neutral-700">Delete Modules, Records, Domain Entities, Reports, Widgets, Ledger data, Chat, Notifications, and other data from the current Workspace while preserving the Workspace and required access.</p><p className="mt-2 text-sm font-medium">Current Workspace: {currentWorkspace.name}</p>
    {error && <Alert variant="error" className="mt-4">{error}</Alert>}
    {state === 'SUCCESS' && <Alert variant="success" className="mt-4">Workspace reset completed. Reloading the clean Workspace…</Alert>}
    {state === 'IDLE' || state === 'ERROR' ? <Button variant="danger" className="mt-4" onClick={begin}>Reset Workspace</Button> : null}
    {state === 'PLANNING' && <p className="mt-4 text-sm text-neutral-500">Planning reset…</p>}
    {(state === 'CONFIRMING' || state === 'RESETTING') && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h3 id="reset-title" className="font-semibold text-red-900">Permanently reset {plan?.workspaceName}</h3><p className="mt-2 text-sm text-red-800">Scope: WORKSPACE DATA RESET. Approximately {plan?.estimatedTotalDocuments ?? 0} top-level documents plus nested data will be removed. This cannot be undone.</p><p className="mt-2 text-xs text-red-700">Preserved: User, Workspace, Organization, Memberships, owner access, and Core Entity Types.</p><div className="mt-4"><Label htmlFor="reset-confirmation">Type the Workspace name to confirm</Label><Input id="reset-confirmation" name="resetConfirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={state === 'RESETTING'} /></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="danger" disabled={confirmation !== currentWorkspace.name || state === 'RESETTING'} onClick={execute}>{state === 'RESETTING' ? 'Resetting…' : 'Permanently Reset Workspace'}</Button><Button variant="ghost" disabled={state === 'RESETTING'} onClick={() => { setState('IDLE'); setPlan(null); setConfirmation(''); }}>Cancel</Button></div></div>}
  </Card>;
}
