import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import { ToastProvider } from '../../../design-system/index.js';
import RecordDetailPage from './RecordDetailPage.jsx';

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
  getModule: vi.fn(),
  getModuleVersion: vi.fn(),
  getEntity: vi.fn(),
  getResourceHistory: vi.fn(),
  submitRecord: vi.fn(),
  archiveRecord: vi.fn(),
  restoreRecord: vi.fn(),
  cancelRecord: vi.fn(),
  listBooks: vi.fn(),
  registerEntry: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    record: { getRecord: mocks.getRecord },
    module: { getModule: mocks.getModule, getModuleVersion: mocks.getModuleVersion },
    entity: { getEntity: mocks.getEntity },
    audit: { getResourceHistory: mocks.getResourceHistory },
    recordCommand: {
      submitRecord: mocks.submitRecord,
      archiveRecord: mocks.archiveRecord,
      restoreRecord: mocks.restoreRecord,
      cancelRecord: mocks.cancelRecord,
    },
    ledger: { listBooks: mocks.listBooks },
    ledgerCommand: { registerEntry: mocks.registerEntry },
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
      { key: 'guest', label: 'Guest', type: 'text' },
      { key: 'stay', label: 'Stay', type: 'date-range' },
      { key: 'room', label: 'Room', type: 'entity-reference', entityTypeId: 'room' },
    ],
  },
};

const makeRecord = (overrides = {}) => ({
  recordId: 'rec-1',
  workspaceId: 'ws-1',
  moduleId: 'reservation',
  moduleVersion: 1,
  recordType: 'RESERVATION',
  status: 'SUBMITTED',
  priority: 'HIGH',
  createdBy: { actorType: 'USER', actorId: 'user-1' },
  submittedBy: { actorType: 'USER', actorId: 'user-2' },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  submittedAt: '2026-10-01T10:00:00.000Z',
  data: {
    guest: 'Guest A',
    stay: { start: '2026-11-01', end: '2026-11-03' },
    room: { workspaceId: 'ws-1', entityTypeId: 'room', entityId: 'room-1' },
  },
  entityReferences: [{ workspaceId: 'ws-1', entityTypeId: 'room', entityId: 'room-1' }],
  ...overrides,
});

function FormProbe() {
  const location = useLocation();
  return <div data-testid="form-state">{JSON.stringify(location.state)}</div>;
}

function renderPage(record, { entity = { entityId: 'room-1', displayName: 'Room 101' }, books = [] } = {}) {
  mocks.getRecord.mockResolvedValue(record);
  mocks.getModule.mockResolvedValue(moduleDef);
  mocks.getModuleVersion.mockResolvedValue({ version: 1, formSchema: moduleDef.formSchema });
  mocks.getEntity.mockResolvedValue(entity);
  mocks.getResourceHistory.mockResolvedValue({ items: [] });
  mocks.listBooks.mockResolvedValue(books);
  mocks.registerEntry.mockResolvedValue({
    entry: { ledgerEntryId: 'le_lb-1_rec-1', referenceNumber: 'RESV-2026-000001', sequenceNumber: 1 },
    operationId: 'op-r',
    idempotent: false,
  });
  for (const fn of [mocks.submitRecord, mocks.archiveRecord, mocks.restoreRecord, mocks.cancelRecord]) {
    fn.mockResolvedValue({ record, operationId: 'op-x', idempotent: false });
  }

  return render(
    <MemoryRouter initialEntries={[`/app/records/${record.recordId}`]}>
      <AuthContext.Provider value={{ user: { userId: 'user-1' } }}>
        <WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1', name: 'Reset Test Hotel', type: 'PERSONAL' } }}>
          <ToastProvider>
            <Routes>
              <Route path="/app/records/:recordId" element={<RecordDetailPage />} />
              <Route path="/app/records" element={<div>Records List</div>} />
              <Route path="/app/records/:recordId/edit" element={<div>Edit Page</div>} />
              <Route path="/app/modules/:moduleId" element={<div>Module Detail</div>} />
              <Route path="/app/modules/:moduleId/form" element={<FormProbe />} />
              <Route path="/app/entities/:entityId" element={<div>Entity Detail</div>} />
            </Routes>
          </ToastProvider>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Record Detail header', () => {
  it('shows the display label, badges, module link and actor metadata', async () => {
    renderPage(makeRecord());
    expect(await screen.findByRole('heading', { name: 'Guest A' })).toBeInTheDocument();
    expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservation' })).toHaveAttribute('href', '/app/modules/reservation');
    expect(screen.getByText('Reset Test Hotel')).toBeInTheDocument();
    expect(screen.getByText('by You')).toBeInTheDocument();
    expect(screen.getByText('by User user-2')).toBeInTheDocument();
    expect(screen.getByText('Rendered using Module Version 1 schema')).toBeInTheDocument();
  });

  it('offers Edit draft only for DRAFT records', async () => {
    renderPage(makeRecord({ status: 'DRAFT', submittedBy: null, submittedAt: null }));
    expect(await screen.findByRole('link', { name: 'Edit draft' })).toHaveAttribute('href', '/app/records/rec-1/edit');
  });

  it('hides Edit draft for submitted records', async () => {
    renderPage(makeRecord());
    await screen.findByRole('heading', { name: 'Guest A' });
    expect(screen.queryByRole('link', { name: 'Edit draft' })).toBeNull();
  });
});

describe('Record Detail content', () => {
  it('renders historical schema values and resolves entity references with navigation', async () => {
    renderPage(makeRecord());
    // 'Guest A' appears both as the header label and as the Guest field value
    expect(await screen.findByRole('heading', { name: 'Guest A' })).toBeInTheDocument();
    expect(screen.getAllByText('Guest A').length).toBeGreaterThanOrEqual(2);
    // date-range renders both endpoints without UTC shifting (locale-agnostic check)
    expect(screen.getByText(
      (content) => content.includes('–') && (content.match(/2026/g) || []).length === 2,
    )).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Room 101' })).toHaveAttribute('href', '/app/entities/room-1');
  });

  it('shows an unavailable marker instead of a link when the entity is gone', async () => {
    renderPage(makeRecord(), { entity: null });
    expect(await screen.findByText(/room-1 \(unavailable\)/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'room-1' })).toBeNull();
  });
});

describe('Record Detail actions', () => {
  it('Create copy navigates to the module form with safe prefilled values', async () => {
    renderPage(makeRecord());
    fireEvent.click(await screen.findByRole('button', { name: 'Create copy' }));
    const state = JSON.parse(screen.getByTestId('form-state').textContent);
    expect(state.prefillValues.guest).toBe('Guest A');
    expect(state.prefillValues.stay).toEqual({ start: '2026-11-01', end: '2026-11-03' });
    expect(state.prefillValues.recordId).toBeUndefined();
    expect(state.prefillValues.createdBy).toBeUndefined();
    expect(state.copySourceLabel).toBe('Guest A');
  });

  it('Print calls the browser print dialog', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage(makeRecord());
    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('Export JSON downloads a sanitized export of the same canonical record', async () => {
    let capturedBlob = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob) => { capturedBlob = blob; return 'blob:fake'; });
    URL.revokeObjectURL = vi.fn();
    renderPage(makeRecord());
    fireEvent.click(await screen.findByRole('button', { name: 'Export JSON' }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const raw = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(capturedBlob);
    });
    const payload = JSON.parse(raw);
    expect(payload.record.recordId).toBe('rec-1');
    expect(payload.record.moduleName).toBe('Reservation');
    expect(payload.record.createdBy).toBe('You');
    expect(payload.fields.find((f) => f.key === 'guest')).toMatchObject({ value: 'Guest A', display: 'Guest A' });
    expect(payload.fields.find((f) => f.key === 'room').display).toBe('Room 101');
    expect(payload.record.entityReferenceIds).toBeUndefined();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });
});

describe('Record Detail lifecycle actions', () => {
  it('shows Submit for a DRAFT and calls the trusted SUBMIT_RECORD command', async () => {
    const draft = makeRecord({ status: 'DRAFT', submittedBy: null, submittedAt: null });
    mocks.submitRecord.mockResolvedValue({ record: draft, operationId: 'op-x', idempotent: false });
    renderPage(draft);
    fireEvent.click(await screen.findByRole('button', { name: 'Submit record' }));
    expect(mocks.submitRecord).toHaveBeenCalledWith({ workspaceId: 'ws-1', recordId: 'rec-1' });
  });

  it('hides Submit for submitted records (policy-driven presentation only)', async () => {
    renderPage(makeRecord());
    await screen.findByRole('heading', { name: 'Guest A' });
    expect(screen.queryByRole('button', { name: 'Submit record' })).toBeNull();
  });

  it('archives only after confirmation and reloads the record view', async () => {
    renderPage(makeRecord());
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    // dialog is open; not executed yet
    expect(mocks.archiveRecord).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(mocks.archiveRecord).toHaveBeenCalledWith({ workspaceId: 'ws-1', recordId: 'rec-1' });
  });

  it('cancels through the confirm dialog via the trusted CANCEL_RECORD command', async () => {
    renderPage(makeRecord());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel record' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel record' }));
    expect(mocks.cancelRecord).toHaveBeenCalledWith({ workspaceId: 'ws-1', recordId: 'rec-1' });
  });

  it('surfaces trusted server rejections as an inline error', async () => {
    renderPage(makeRecord({ status: 'DRAFT', submittedBy: null, submittedAt: null }));
    mocks.submitRecord.mockRejectedValue(new Error('Guest is required'));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Guest is required/);
  });
});

describe('Record Detail — trusted Ledger registration', () => {
  it('registers an unregistered submitted Record through the trusted ledgerCommand', async () => {
    renderPage(makeRecord(), { books: [{ ledgerBookId: 'lb-1', name: 'Reservation Register', status: 'ACTIVE' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Register in Ledger' }));
    expect(mocks.registerEntry).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      recordId: 'rec-1',
      ledgerBookId: 'lb-1',
    });
  });

  it('shows no registration panel when the Record already has ledger linkage', async () => {
    renderPage(makeRecord({ referenceNumber: 'RESV-2026-000001', ledgerBookId: 'lb-1', ledgerEntryId: 'le-1' }));
    await screen.findByRole('heading', { name: 'Guest A' });
    expect(screen.queryByRole('button', { name: 'Register in Ledger' })).toBeNull();
    expect(screen.getByText('RESV-2026-000001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Book' })).toHaveAttribute('href', '/app/ledger/lb-1');
  });

  it('shows no registration panel for DRAFT Records', async () => {
    renderPage(makeRecord({ status: 'DRAFT', submittedBy: null, submittedAt: null }), {
      books: [{ ledgerBookId: 'lb-1', name: 'Book', status: 'ACTIVE' }],
    });
    await screen.findByRole('heading', { name: 'Guest A' });
    expect(screen.queryByRole('button', { name: 'Register in Ledger' })).toBeNull();
  });
});
