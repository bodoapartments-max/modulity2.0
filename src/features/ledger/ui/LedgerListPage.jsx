import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import EmptyState from '../../../design-system/components/EmptyState/EmptyState.jsx';
import ErrorState from '../../../design-system/components/ErrorState/ErrorState.jsx';
import LoadingState from '../../../design-system/components/LoadingState/LoadingState.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import { useWorkspaceQuery } from '../../../app/hooks/useWorkspaceQuery.js';

const STATUS_COLORS = { ACTIVE: 'bg-green-100 text-green-800', CLOSED: 'bg-neutral-200 text-neutral-600', ARCHIVED: 'bg-neutral-100 text-neutral-500' };

export default function LedgerListPage() {
  const { currentWorkspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;
  const loader = useCallback(() => services.ledger.listBooks(workspaceId), [workspaceId]);
  const { data: books = [], error, initialLoading: loading, refresh } = useWorkspaceQuery({
    workspaceId, resource: 'ledgerBooks', loader, enabled: Boolean(workspaceId), ttlMs: 30000,
  });

  if (workspaceLoading || loading) return <PageContainer><LoadingState message="Loading Ledger..." /></PageContainer>;
  if (workspaceError || !currentWorkspace) return <PageContainer><ErrorState title="Workspace unavailable" message="Select an available workspace before opening Ledger." /></PageContainer>;
  if (error && books.length === 0) return <PageContainer><PageHeader title="Ledger" /><ErrorState message="Ledger books could not be loaded." retry={refresh} /></PageContainer>;

  return <PageContainer><PageHeader title="Ledger" description="Numbered registers for traceable business records" action={<Link to="/app/ledger/new"><Button>New Ledger Book</Button></Link>} />
    {books.length === 0 ? <EmptyState title="No ledger books yet" description="Create a Ledger Book when this workspace needs numbered registration."><Link to="/app/ledger/new"><Button>Create Ledger Book</Button></Link></EmptyState> : <div className="space-y-3">{books.map((book) => <Link key={book.ledgerBookId} to={`/app/ledger/${book.ledgerBookId}`} className="block rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-primary-300"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><h3 className="text-base font-semibold text-neutral-900">{book.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[book.status] || ''}`}>{book.status}</span></div><p className="mt-0.5 font-mono text-xs text-neutral-400">{book.ledgerCode}</p>{book.description && <p className="mt-1 text-sm text-neutral-500">{book.description}</p>}</div><div className="text-right text-sm text-neutral-500"><p>Block size: {book.blockSize}</p>{book.moduleId && <p className="text-xs text-neutral-400">Module-scoped</p>}</div></div></Link>)}</div>}
  </PageContainer>;
}
