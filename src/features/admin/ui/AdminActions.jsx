/**
 * AdminActions — shared administration action strip for protected resources.
 * Uses trusted-boundary callouts; Delete is the exceptional destructive path.
 */
import { useState } from 'react';
import Button from '../../../design-system/components/Button/Button.jsx';
import { Dialog, Input } from '../../../design-system/index.js';

export default function AdminActions({ resourceLabel, status, onRename, onArchive, onRestore, onDelete, busy }) {
  const [confirm, setConfirm] = useState(null); // RENAME | ARCHIVE | RESTORE | DELETE
  const [renameValue, setRenameValue] = useState('');
  const archived = status === 'ARCHIVED';

  const run = async (fn) => {
    await fn();
    setConfirm(null);
    setRenameValue('');
  };

  return (
    <>
      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-semibold uppercase text-neutral-500">Administration</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy || archived} onClick={() => setConfirm('RENAME')}>Rename</Button>
          {!archived && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm('ARCHIVE')}>Archive</Button>}
          {archived && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm('RESTORE')}>Restore</Button>}
          <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => setConfirm('DELETE')}>Delete</Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Archive is the default lifecycle action. Delete is rare and blocked if the resource has dependencies.</p>
      </div>

      <Dialog open={confirm === 'RENAME'} onClose={() => setConfirm(null)} title={`Rename ${resourceLabel}`}>
        <Input label="New display name" id="admin-rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        <p className="mt-1 text-xs text-neutral-500">Technical code and internal identity stay unchanged.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Back</Button>
          <Button type="button" variant="primary" disabled={busy || !renameValue.trim()} onClick={() => run(() => onRename(renameValue.trim()))}>Rename</Button>
        </div>
      </Dialog>

      <Dialog open={confirm === 'ARCHIVE'} onClose={() => setConfirm(null)} title={`Archive ${resourceLabel}`}>
        <p className="text-sm text-neutral-600">Archiving removes this from active pickers but keeps every historical reference (Records, Ledger entries, Audit) intact.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Back</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={() => run(onArchive)}>Archive</Button>
        </div>
      </Dialog>

      <Dialog open={confirm === 'RESTORE'} onClose={() => setConfirm(null)} title={`Restore ${resourceLabel}`}>
        <p className="text-sm text-neutral-600">Restore makes this configuration available again. Historical evidence stays untouched.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Back</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={() => run(onRestore)}>Restore</Button>
        </div>
      </Dialog>

      <Dialog open={confirm === 'DELETE'} onClose={() => setConfirm(null)} title={`Delete ${resourceLabel}?`}>
        <p className="text-sm text-neutral-700">Permanent deletion is only possible when the trusted dependency check finds zero references. The operation is audited — if deletion is blocked, the exact dependencies are shown.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Back</Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => run(onDelete)}>Delete permanently</Button>
        </div>
      </Dialog>
    </>
  );
}
