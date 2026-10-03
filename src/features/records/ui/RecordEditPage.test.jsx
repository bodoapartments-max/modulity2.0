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
  updateDraftRecord: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    record: { getRecord: mocks.getRecord, updateDraftRecord: mocks.updateDraftRecord },
    module: { getModule: mocks.getModule, getModuleVersion: mocks.getModuleVersion },
    entity: { getEntity: mocks.getEntity, listEntities: mocks.listEntities },
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
  mocks.updateDraftRecord.mockResolvedValue({ ...record, updatedAt: '2026-10-03T10:00:00.000Z' });

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
  const call = mocks.updateDraftRecord.mock.calls.at(-1);
  return { workspaceId: call[0], recordId: call[1], changes: call[2], actor: call[3] };
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
    expect(mocks.updateDraftRecord).not.toHaveBeenCalled();
  });
});

describe('Record Edit — saving', () => {
  it('manual save updates the same draft with derived entity references, without validation blocking partial drafts', async () => {
    renderPage();
    const guestInput = await screen.findByDisplayValue('Draft Guest');
    fireEvent.change(guestInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/All changes saved/);
    const { workspaceId, recordId, changes, actor } = lastSave();
    expect(workspaceId).toBe('ws-1');
    expect(recordId).toBe('rec-draft');
    expect(changes.data.guest).toBeUndefined();
    expect(changes.entityReferences).toEqual([roomRef]);
    expect(actor).toEqual({ actorType: 'USER', actorId: 'user-1' });
  });

  it('autosaves debounced changes to the same draft record', async () => {
    renderPage();
    const guestInput = await screen.findByDisplayValue('Draft Guest');

    vi.useFakeTimers();
    fireEvent.change(guestInput, { target: { value: 'Draft Guest Updated' } });
    expect(mocks.updateDraftRecord).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(mocks.updateDraftRecord).toHaveBeenCalledTimes(1);
    expect(lastSave().changes.data.guest).toBe('Draft Guest Updated');
    vi.useRealTimers();
    expect(await screen.findByText(/All changes saved/)).toBeInTheDocument();
  });

  it('shows an error state and retry when saving fails', async () => {
    renderPage();
    // Force persistance failure AFTER the page mocks have installed their defaults
    mocks.updateDraftRecord.mockReset();
    mocks.updateDraftRecord.mockRejectedValue(new Error('permission-denied'));
    const guestInput = await screen.findByDisplayValue('Draft Guest');
    vi.useFakeTimers();
    fireEvent.change(guestInput, { target: { value: 'X' } });
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
    vi.useRealTimers();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Save failed — permission-denied/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
