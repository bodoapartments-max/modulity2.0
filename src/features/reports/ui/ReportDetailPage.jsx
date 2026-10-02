import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import ReportResultView from './ReportResultView.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const workspaceId = currentWorkspace?.workspaceId;
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async () => {
    try { setRunning(true); setError(null); setResult(await services.report.execute(workspaceId, reportId)); }
    catch (runError) { setError(runError.code === 'LIMIT_EXCEEDED' ? runError.message : `Report execution failed: ${runError.message}`); }
    finally { setRunning(false); }
  }, [workspaceId, reportId]);
  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return undefined;
    services.report.get(workspaceId, reportId).then((value) => { if (!cancelled) { setReport(value); if (value) run(); } }).catch(() => setError('Report could not be loaded.')).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, reportId, run]);
  if (loading) return <PageContainer><LoadingState message="Loading Report..." /></PageContainer>;
  if (!report) return <PageContainer><ErrorState message={error || 'Report not found.'} /></PageContainer>;
  const actor = { actorType: 'USER', actorId: user?.userId || user?.uid };
  return <PageContainer><PageHeader title={report.name} description={report.description} action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={run} disabled={running}>{running ? 'Running…' : 'Run'}</Button><Link to={`/app/reports/${reportId}/edit`}><Button variant="outline">Edit</Button></Link><Button variant="danger" onClick={async () => { await services.report.archive(workspaceId, reportId, actor); workspaceQueryCache.invalidate(`${workspaceId}:reports:`); navigate('/app/reports'); }}>Archive</Button></div>} />{error && <ErrorState message={error} />}{running && !result ? <LoadingState message="Executing bounded Report..." /> : result && <ReportResultView result={result} />}</PageContainer>;
}
