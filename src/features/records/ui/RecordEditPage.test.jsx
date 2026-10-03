import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import RecordEditPage from './RecordEditPage.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
  getModule: vi.fn(),
  getModuleVersion: vi.fn(),
  getEntity: vi.fn(),
  listEntities: vi.fn(),
  updateDraft: vi.fn(),
  submitDraft: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    record: { getRecord: mocks.getRecord },
    module: { getModule: mocks.getModule, getModuleVersion: mocks.getModuleVersion },
    entity: { getEntity: mocks.getEntity, listEntities: mocks.listEntities },
    recordCommand: { updateDraft: mocks.updateDraft },
    moduleSubmission: { submitDraft: mocks.submitDraft },
  },
}));

const moduleDef = {
  moduleId: 'reservation',
  name: 'Reservation',
  status: 'ACTIVE',
  version: 1,
  displayConfig: { primaryField: 'guest' },
  formSchema: {
    fields: [
      { key: 'guest', label: 'Guest', type: 'text', required: true },
      { key: 'room', label: 'Room', type: 'entity-reference', entityTypeId: 'room' },
    ],
  },
};

const roomRef = { workspaceId: 'ws-1', entityTypeId: 'room', entityId: 'room-1' };

const draftRecord = {
  recordId: 'rec-draft',
  workspaceId: 'ws-1',
  moduleId: 'reservation',
  moduleVersion: 1,
  recordType: 'RESERVATION',
  status: 'DRAFT',
  priority: null,
  createdBy: { actorType: 'USER', actorId: 'user-1' },
  submittedBy: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  submittedAt: null,
  data: { guest: 'Draft Guest', room: roomRef },
  entityReferences: [roomRef],
};

function renderPage(record = draftRecord) {
  mocks.getRecord.mockResolvedValue(record);
  mocks.getModule.mockResolvedValue(moduleDef);
  mocks.getModuleVersion.mockResolvedValue({ version: 1, formSchema: moduleDef.formSchema });
  mocks.getEntity.mockResolvedValue({ entityId: 'room-1', displayName: 'Room 101' });
  mocks.listEntities.mockResolvedValue([]);
  mocks.updateDraft.mockResolvedValue({ record: { ...record, updatedAt: '2026-10-03T10:00:00.000Z' }, operationId: 'op-x', idempotent: false });
  mocks.submitDraft.mockResolvedValue({ ...record, status: 'SUBMITTED' });

  return render(
    <MemoryRouter initialEntries={[`/app/records/${record.recordId}/edit`]}>
      <AuthContext.Provider value={{ user: { userId: 'user-1' } }}>
        <WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1', name: 'WS' } }}>
          <Routes>
            <Route path="/app/records/:recordId/edit" element={<RecordEditPage />} />
            <Route path="/app/records/:recordId" element={<div>Detail</div>} />
          </Routes>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const lastSave = () => {
  const call = mocks.updateDraft.mock.calls.at(-1)[0];
  return call;
};

beforeEach(() => {
  vi.clearAllMocks();
  workspaceQueryCache.clear();
});
afterEach(() => vi.useRealTimers());

describe('Record Edit — guards', () => {
  it('renders the draft form with existing values', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Draft Guest')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('blocks editing when the record is not a draft', async () => {
    renderPage({ ...draftRecord, status: 'SUBMITTED' });
    expect(await screen.findByText(/can no longer be edited/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });
});

describe('Record Edit — saving', () => {
  it('manual save sends current form values through the trusted UPDATE_DRAFT command, without validation blocking partial drafts', async () => {
    renderPage();
    const guestInput = await screen.findByDisplayValue('Draft Guest');
    fireEvent.change(guestInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/All changes saved/);
    const call = lastSave();
    expect(call.workspaceId).toBe('ws-1');
    expect(call.recordId).toBe('rec-draft');
    expect(call.values.guest).toBeUndefined();
    expect(call.values.room).toEqual(roomRef);
    expect(typeof call.operationId).toBe('string');
  });

  it('autosaves debounced changes through trusted UPDATE_DRAFT to the same draft record', async () => {
    renderPage();
    const guestInput = await screen.findByDisplayValue('Draft Guest');

    vi.useFakeTimers();
    fireEvent.change(guestInput, { target: { value: 'Draft Guest Updated' } });
    expect(mocks.updateDraft).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(mocks.updateDraft).toHaveBeenCalledTimes(1);
    expect(lastSave().values.guest).toBe('Draft Guest Updated');
    vi.useRealTimers();
    expect(await screen.findByText(/All changes saved/)).toBeInTheDocument();
  });

  it('reuses the operationId when retrying an identical failed payload', async () => {
    renderPage();
    mocks.updateDraft.mockReset();
    mocks.updateDraft.mockRejectedValueOnce(new Error('permission-denied'));
    const guestInput = await screen.findByDisplayValue('Draft Guest');
    vi.useFakeTimers();
    fireEvent.change(guestInput, { target: { value: 'X' } });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    vi.useRealTimers();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Save failed — permission-denied/);
    const failedOpId = lastSave().operationId;

    mocks.updateDraft.mockResolvedValue({ record: { ...draftRecord }, operationId: failedOpId, idempotent: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(/All changes saved/);
    expect(lastSave().operationId).toBe(failedOpId);
  });
});

describe('Record Edit — submit', () => {
  it('submits the draft through the trusted SUBMIT_RECORD path and navigates to the detail view', async () => {
    renderPage();
    await screen.findByDisplayValue('Draft Guest');
    fireEvent.click(screen.getByRole('button', { name: 'Submit record' }));
    await screen.findByText('Detail');
    expect(mocks.submitDraft).toHaveBeenCalledTimes(1);
    expect(mocks.submitDraft.mock.calls[0][0]).toMatchObject({ workspaceId: 'ws-1', recordId: 'rec-draft' });
  });

  it('flushes pending autosave edits before submitting', async () => {
    renderPage();
    const guestInput = await screen.findByDisplayValue('Draft Guest');
    fireEvent.change(guestInput, { target: { value: 'Final' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit record' }));
    await screen.findByText('Detail');
    expect(mocks.updateDraft).toHaveBeenCalledTimes(1);
    expect(lastSave().values.guest).toBe('Final');
    expect(mocks.submitDraft).toHaveBeenCalledTimes(1);
  });

  it('shows the server rejection and keeps editing when submit validation fails', async () => {
    renderPage();
    mocks.submitDraft.mockRejectedValue(new Error('Guest is required'));
    await screen.findByDisplayValue('Draft Guest');
    fireEvent.click(screen.getByRole('button', { name: 'Submit record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Guest is required/);
    expect(screen.queryByText('Detail')).toBeNull();
  });
});
