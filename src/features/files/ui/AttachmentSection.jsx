/**
 * AttachmentSection — reusable attachment list + upload for canonical targets.
 *
 * Generic across attachment target types (RECORD, ENTITY) — no per-Module or
 * per-domain variants. All mutations flow through the trusted fileCommand
 * boundary; this component only shows actions the shared policy permits.
 *
 * States follow the platform contract: INITIAL_LOADING / READY / ERROR,
 * with per-action busy handling.
 */
import { useCallback, useEffect, useState } from 'react';
import FileUpload from '../../../design-system/components/FileUpload/FileUpload.jsx';
import { Button, useToast } from '../../../design-system/index.js';
import { uploadAndAttachFile, formatFileSize } from '../model.js';
import { MAX_FILE_SIZE_BYTES } from '../../../core/files/fileConstraints.js';
import services from '../../../infrastructure/services.js';

export default function AttachmentSection({ workspaceId, targetType, targetId, title = 'Attachments' }) {
  const { showToast } = useToast();
  const [state, setState] = useState('INITIAL_LOADING');
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId || !targetType || !targetId) return;
    try {
      const result = await services.file.listAttachmentsForTarget(workspaceId, targetType, targetId);
      setItems(result);
      setState('READY');
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load attachments');
      setState('ERROR');
    }
  }, [workspaceId, targetType, targetId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = useCallback(async ({ files, error: uploadError }) => {
    if (uploadError) {
      showToast({ message: uploadError, variant: 'error' });
      return;
    }
    const browserFile = files?.[0];
    if (!browserFile) return;
    setBusy(true);
    try {
      await uploadAndAttachFile({
        storage: services.fileStorage,
        fileCommand: services.fileCommand,
        workspaceId,
        browserFile,
        targetType,
        targetId,
      });
      showToast({ message: 'File attached', variant: 'success' });
      await load();
    } catch (err) {
      showToast({ message: err.message || 'Upload failed', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [workspaceId, targetType, targetId, showToast, load]);

  const handleDetach = useCallback(async (attachmentId) => {
    setBusy(true);
    try {
      await services.fileCommand.detachFile({ workspaceId, attachmentId });
      showToast({ message: 'Attachment removed', variant: 'success' });
      await load();
    } catch (err) {
      showToast({ message: err.message || 'Detach failed', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [workspaceId, showToast, load]);

  const handleOpen = useCallback(async (file) => {
    try {
      const url = await services.fileStorage.getDownloadUrl(file.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast({ message: err.message || 'Could not open file', variant: 'error' });
    }
  }, [showToast]);

  return (
    <section aria-label={title} className="mt-8 border-t border-neutral-200 pt-6">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h2>

      <FileUpload
        id="attachment-upload"
        disabled={busy || state === 'INITIAL_LOADING'}
        maxSizeBytes={MAX_FILE_SIZE_BYTES}
        helperText={`Max ${formatFileSize(MAX_FILE_SIZE_BYTES)} per file.`}
        onChange={handleUpload}
      />

      {state === 'INITIAL_LOADING' && (
        <p className="mt-3 text-sm text-neutral-500">Loading attachments…</p>
      )}
      {state === 'ERROR' && (
        <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
      )}
      {state === 'READY' && items.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">No attachments yet.</p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map(({ attachment, file }) => (
            <li
              key={attachment.attachmentId}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {file.displayName || file.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {file.mimeType} · {formatFileSize(file.size)} · v{attachment.fileVersion}
                  {file.status !== 'ACTIVE' ? ` · ${file.status.toLowerCase()}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => handleOpen(file)}>
                  Open
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => handleDetach(attachment.attachmentId)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
