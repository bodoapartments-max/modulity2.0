/**
 * Create Ledger Book — configures a VISIBLE register over canonical evidence
 * (Step 17.1.1).
 *
 * PRESERVATION != ORGANIZATION: submissions create trusted Ledger evidence
 * automatically even before any book is configured. This page lets the user
 * intentionally organize that evidence into a named register with its own
 * immutable numbering. On creation the trusted engine backfills the eligible
 * historical evidence for the selected source.
 *
 * Creation goes through the trusted ledgerCommand boundary — code
 * reservation, book, initial block and the historical backfill are
 * server-authored. The browser never authors sequences/references.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import services from '../../../infrastructure/services.js';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';
import { generateTechnicalCode } from '../../../core/utils/technicalCode.js';

function suggestPrefix(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
}

export default function CreateLedgerBookPage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [name, setName] = useState('');
  const [ledgerCode, setLedgerCode] = useState('');
  const [description, setDescription] = useState('');
  const [sourceModuleId, setSourceModuleId] = useState('');
  const [blockSize, setBlockSize] = useState(100);
  const [referencePrefix, setReferencePrefix] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !services?.module?.listModules) {
      setModulesLoading(false);
      return undefined;
    }
    services.module.listModules(workspaceId)
      .then((list) => { if (!cancelled) setModules(Array.isArray(list) ? list : []); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setModulesLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  const eligibleModules = useMemo(
    () => modules.filter((mod) => mod.status === 'ACTIVE' || mod.status === 'INACTIVE'),
    [modules],
  );

  function handleSourceChange(moduleId) {
    setSourceModuleId(moduleId);
    const mod = eligibleModules.find((m) => m.moduleId === moduleId) || null;
    if (mod) {
      if (!name) setName(`${mod.name} Register`);
      const prefix = mod.moduleCode || suggestPrefix(mod.name);
      if (!prefixTouched) setReferencePrefix(prefix);
      if (!codeTouched) setLedgerCode(suggestPrefix(prefix) ? `${suggestPrefix(prefix)}_LEDGER`.slice(0, 32) : '');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!workspaceId || !user) return;

    setSaving(true);
    setError(null);
    try {
      // Humans provide business meaning; the system generates the technical
      // identifier. If the user typed one it is honored; otherwise derived.
      const resolvedCode = ledgerCode.trim() ? ledgerCode.toUpperCase() : generateTechnicalCode(name);
      const result = await services?.ledgerCommand?.createBook({
        workspaceId,
        ledgerCode: resolvedCode,
        name,
        description,
        blockSize: parseInt(blockSize, 10) || 100,
        referencePrefix: referencePrefix.toUpperCase() || resolvedCode,
        sourceDefinition: sourceModuleId ? { type: 'MODULE', moduleId: sourceModuleId } : null,
      });
      const book = result?.book;
      if (book) {
        workspaceQueryCache.invalidate(`${workspaceId}:ledgerBooks:`);
        navigate(`/app/ledger/${book.ledgerBookId}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link to="/app/ledger" className="text-sm text-primary-600 hover:underline mb-4 inline-block">&larr; Ledger</Link>
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">New Ledger Book</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Organize official form history into a named register. Submissions are preserved by the
        trusted Ledger even before a book exists — creating a book registers the eligible
        history for the selected source.
      </p>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-name">Name *</label>
          <input
            id="lb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            placeholder="Vehicle Inspection Register"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-source">Source</label>
          <select
            id="lb-source"
            value={sourceModuleId}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={modulesLoading}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          >
            <option value="">No source — manually registered Records only</option>
            {eligibleModules.map((mod) => (
              <option key={mod.moduleId} value={mod.moduleId}>
                {mod.name}{mod.moduleCode ? ` (${mod.moduleCode})` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400 mt-1">
            A Module source turns this book into the workspace register for that form:
            new submissions register here, and eligible existing submissions are organized
            into the book with their own immutable sequence.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-description">Description</label>
          <textarea
            id="lb-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none resize-none"
            placeholder="Official vehicle inspection forms"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-code">Ledger Code</label>
          <input
            id="lb-code"
            type="text"
            value={ledgerCode}
            onChange={(e) => { setCodeTouched(true); setLedgerCode(e.target.value.toUpperCase()); }}
            pattern="[A-Z][A-Z0-9_]*"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            placeholder="Auto-generated from the Name when left empty"
          />
          <p className="text-xs text-neutral-400 mt-1">Uppercase letters, digits, underscores. Auto-generated from the Name when empty; stable afterwards.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-blocksize">Block Size</label>
            <select
              id="lb-blocksize"
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="lb-prefix">Reference Prefix</label>
            <input
              id="lb-prefix"
              type="text"
              value={referencePrefix}
              onChange={(e) => { setPrefixTouched(true); setReferencePrefix(e.target.value.toUpperCase()); }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="Auto (uses code)"
            />
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving || !name || !workspaceId || !user}
            className="w-full sm:w-auto px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={!workspaceId ? 'Waiting for the workspace to load…' : undefined}
          >
            {saving ? 'Creating...' : 'Create Ledger Book'}
          </button>
        </div>
      </form>
    </div>
  );
}
