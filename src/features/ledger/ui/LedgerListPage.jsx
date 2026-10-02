/**
 * Ledger List — displays all Ledger Books in the current workspace.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import services from '../../../infrastructure/services.js';

const STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-neutral-200 text-neutral-600',
  ARCHIVED: 'bg-neutral-100 text-neutral-500',
};

export default function LedgerListPage() {
  const { currentWorkspace } = useWorkspace();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    services?.ledger?.listBooks(workspaceId)
      .then((result) => { if (!cancelled) setBooks(result || []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-neutral-200 rounded" />
          <div className="h-32 bg-neutral-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Ledger</h1>
          <p className="text-sm text-neutral-500 mt-1">Numbered registers for traceable business records</p>
        </div>
        <Link
          to="/app/ledger/new"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          New Ledger Book
        </Link>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {books.length === 0 ? (
        <div className="text-center py-16 bg-white border border-neutral-200 rounded-xl">
          <p className="text-neutral-500">No ledger books yet.</p>
          <Link to="/app/ledger/new" className="text-primary-600 hover:underline text-sm mt-2 inline-block">
            Create your first ledger book
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Link
              key={book.ledgerBookId}
              to={`/app/ledger/${book.ledgerBookId}`}
              className="block bg-white border border-neutral-200 rounded-xl p-4 hover:border-primary-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-neutral-900">{book.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[book.status] || ''}`}>
                      {book.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">{book.ledgerCode}</p>
                  {book.description && (
                    <p className="text-sm text-neutral-500 mt-1">{book.description}</p>
                  )}
                </div>
                <div className="text-right text-sm text-neutral-500">
                  <p>Block size: {book.blockSize}</p>
                  {book.moduleId && <p className="text-xs text-neutral-400">Module-scoped</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
