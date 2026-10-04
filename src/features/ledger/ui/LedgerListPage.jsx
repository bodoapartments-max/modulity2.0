/**
 * Ledger — Form Books view (V1-style paper register).
 *
 * One row per FORM BOOK (module register), not per submission. Each row
 * reports the current block's consume state: filled (active entries), voided
 * (cancelled entries — consumed forever), and remaining slots. Clicking a
 * row opens the book's historical view.
 *
 * All data projects the canonical LedgerBook/LedgerBlock/LedgerEntry
 * documents — no derived persistence.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';
import PageContainer from '../../../design-system/components/PageContainer/PageContainer.jsx';
import PageHeader from '../../../design-system/components/PageHeader/PageHeader.jsx';
import DataGrid from '../../../design-system/components/DataGrid/DataGrid.jsx';
import Badge from '../../../design-system/components/Badge/Badge.jsx';
import Button from '../../../design-system/components/Button/Button.jsx';
import { deriveFormBookCounters, selectCurrentBlock } from '../model.js';

export default function LedgerListPage() {
  const { currentWorkspace, error: workspaceError } = useWorkspace();
  const workspaceId = currentWorkspace?.workspaceId;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (background = false) => {
    if (!workspaceId || !services?.ledger?.listBooks) return;
    if (!background) setLoading(true);
    setError(null);
    try {
      const books = await services.ledger.listBooks(workspaceId);
      const enriched = await Promise.all(
        (Array.isArray(books) ? books : []).map(async (book) => {
          let blocks = [];
          try {
            blocks = await services.ledger.listBlocks(workspaceId, book.ledgerBookId);
          } catch { /* keep empty block state */ }
          const currentBlock = selectCurrentBlock(blocks);
          let entries = [];
          if (currentBlock && services?.ledgerQuery?.queryEntries) {
            try {
              const page = await services.ledgerQuery.queryEntries({
                workspaceId,
                ledgerBookId: book.ledgerBookId,
                ledgerBlockId: currentBlock.ledgerBlockId,
                limit: 200,
              });
              entries = page?.items || [];
            } catch { /* keep counters with zero voided */ }
          }
          const counters = deriveFormBookCounters(book, currentBlock, entries);
          return { book, blocks, currentBlock: counters ? { ...currentBlock } : currentBlock, counters };
        }),
      );
      setRows(enriched);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    {
      key: 'book',
      header: 'Form Book',
      render: (row) => (
        <Link to={`/app/ledger/${row.book.ledgerBookId}`} className="font-medium text-neutral-900 hover:text-primary-600">
          {row.book.name}
        </Link>
      ),
    },
    {
      key: 'block',
      header: 'Block',
      render: (row) => (row.currentBlock && row.counters
        ? `#${row.counters.blockNumber ?? 1} · ${row.counters.rangeStart}–${row.counters.rangeEnd}`
        : <span className="text-neutral-400">No block yet</span>),
    },
    { key: 'capacity', header: 'Capacity', render: (row) => row.counters.capacity },
    {
      key: 'filled',
      header: 'Filled',
      render: (row) => <span className="font-semibold text-green-700">{row.counters.filled}</span>,
    },
    {
      key: 'voided',
      header: 'Voided',
      render: (row) => row.counters.voided > 0
        ? <span className="font-semibold text-red-600">{row.counters.voided}</span>
        : <span className="text-neutral-400">0</span>,
    },
    {
      key: 'remaining',
      header: 'Remaining',
      render: (row) => <span className="font-semibold text-neutral-800">{row.counters.remaining}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.counters.status === 'FULL' ? 'default' : 'success'}>
          {row.counters.status === 'FULL' ? 'Full (historical)' : 'Active'}
        </Badge>
      ),
    },
    {
      key: 'open',
      header: '',
      render: (row) => (
        <Link to={`/app/ledger/${row.book.ledgerBookId}`}>
          <Button type="button" variant="outline" size="sm">Open register</Button>
        </Link>
      ),
    },
  ], []);

  if (workspaceError || !currentWorkspace) {
    return <PageContainer><PageHeader title="Ledger" description="Permanent register of official forms in this workspace." /><ErrorStateLocal message="Select an available workspace first." /></PageContainer>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Ledger"
        description="Permanent register of official forms in this workspace."
        action={<Link to="/app/ledger/new"><Button>New Ledger Book</Button></Link>}
      />
      <p className="mb-4 text-xs text-neutral-500">
        Submitted operational forms are registered automatically. Sequences are never reused;
        voided forms stay in the book.
      </p>
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(row) => row.book.ledgerBookId}
        loading={loading}
        error={error}
        emptyMessage="No form books yet"
        emptyDescription="Submit an official form through a Module and its Form Book will appear here automatically."
        ariaLabel="Form books"
      />
      {rows.length > 0 && (
        <p className="mt-3 text-xs text-neutral-400">
          Showing {rows.length} form book{rows.length === 1 ? '' : 's'} · counters refresh on this page load
        </p>
      )}
    </PageContainer>
  );
}

function ErrorStateLocal({ message }) {
  return (
    <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>
  );
}
