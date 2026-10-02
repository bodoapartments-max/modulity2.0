/**
 * Create Ledger Book — form for creating a new Ledger Book.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../../app/providers/WorkspaceProvider.jsx';
import { useAuth } from '../../../app/providers/AuthProvider.jsx';
import { userActor } from '../../../core/data/actorRef.js';
import services from '../../../infrastructure/services.js';

export default function CreateLedgerBookPage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [ledgerCode, setLedgerCode] = useState('');
  const [description, setDescription] = useState('');
  const [blockSize, setBlockSize] = useState(100);
  const [referencePrefix, setReferencePrefix] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const workspaceId = currentWorkspace?.workspaceId;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!workspaceId || !user) return;

    setSaving(true);
    setError(null);
    try {
      const book = await services?.ledger?.createBook({
        workspaceId,
        ledgerCode: ledgerCode.toUpperCase(),
        name,
        description,
        blockSize: parseInt(blockSize, 10) || 100,
        referencePrefix: referencePrefix.toUpperCase() || ledgerCode.toUpperCase(),
        actor: userActor(user.uid),
      });
      if (book) {
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
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Create Ledger Book</h1>

      {error && (
        <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            placeholder="Vehicle Inspection Register"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Ledger Code *</label>
          <input
            type="text"
            value={ledgerCode}
            onChange={(e) => setLedgerCode(e.target.value.toUpperCase())}
            required
            pattern="[A-Z][A-Z0-9_]*"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            placeholder="VEHICLE_INSPECTION"
          />
          <p className="text-xs text-neutral-400 mt-1">Uppercase letters, digits, underscores. Must start with a letter.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none resize-none"
            placeholder="Optional description..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Block Size</label>
            <select
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
            <label className="block text-sm font-medium text-neutral-700 mb-1">Reference Prefix</label>
            <input
              type="text"
              value={referencePrefix}
              onChange={(e) => setReferencePrefix(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="Auto (uses code)"
            />
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving || !name || !ledgerCode}
            className="w-full sm:w-auto px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating...' : 'Create Ledger Book'}
          </button>
        </div>
      </form>
    </div>
  );
}
