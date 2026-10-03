import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import RecordListPage from './RecordListPage.jsx';
import { workspaceQueryCache } from '../../../core/cache/workspaceQueryCache.js';

const mocks = vi.hoisted(() => ({
  listModules: vi.fn(),
  queryRecords: vi.fn(),
  archiveRecord: vi.fn(),
  toggleStar: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    module: { listModules: mocks.listModules },
    recordQuery: { queryRecords: mocks.queryRecords },
    recordCommand: { archiveRecord: mocks.archiveRecord },
    folder: { toggleStar: mocks.toggleStar },
  },
}));

const modules = [
  {
    moduleId: 'reservation',
    name: 'Reservation',
    displayConfig: { primaryField: 'guest' },
    formSchema: { fields: [{ key: 'guest', label: 'Guest', type: 'text' }] },
  },
];
const record = (id, guest) => ({
  recordId: id,
  recordType: 'RESERVATION',
  moduleId: 'reservation',
  status: 'SUBMITTED',
  priority: 'HIGH',
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-03T12:00:00.000Z',
  data: { guest },
  entityReferences: [],
});

function renderPage(entry = '/app/records') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthContext.Provider value={{ user: { userId: 'user-1' } }}>
        <WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'workspace-1' } }}>
          <Routes>
            <Route path="/app/records" element={<RecordListPage />} />
            <Route path="/app/records/:recordId" element={<div>Record Detail</div>} />
          </Routes>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const lastCall = () => mocks.queryRecords.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  workspaceQueryCache.clear();
  mocks.listModules.mockResolvedValue(modules);
  mocks.queryRecords.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
});

describe('global Record List', () => {
  it('renders module name and display label', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('rec-1', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    expect(await screen.findByText('Guest A')).toHaveAttribute('href', '/app/records/rec-1');
    expect(screen.getAllByText('Reservation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SUBMITTED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0);
  });

  it('updates sort through the whitelisted sort select', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('rec-1', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    await screen.findByText('Guest A');
    fireEvent.change(screen.getByLabelText('Sort records'), { target: { value: 'oldest' } });
    await waitFor(() => {
      expect(lastCall()).toMatchObject({ sortField: 'createdAt', sortDirection: 'ASC' });
    });
  });

  it('filters by module through the module select', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    renderPage();
    await screen.findByLabelText('Module filter');
    await waitFor(() => expect(mocks.listModules).toHaveBeenCalledWith('workspace-1'));
    fireEvent.change(screen.getByLabelText('Module filter'), { target: { value: 'reservation' } });
    await waitFor(() => {
      expect(lastCall()).toMatchObject({ moduleId: 'reservation' });
    });
  });

  it('shows a no-match state when search finds nothing on the loaded page', async () => {
    mocks.queryRecords.mockResolvedValue({ items: [record('rec-1', 'Guest A')], hasMore: false, nextCursor: null });
    renderPage();
    await screen.findByText('Guest A');
    fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'nomatch' } });
    expect(await screen.findByText('No matching records on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('paginates forward with the cursor and back to page 1', async () => {
    mocks.queryRecords
      .mockResolvedValueOnce({ items: [record('rec-1', 'Guest A')], hasMore: true, nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [record('rec-2', 'Guest B')], hasMore: false, nextCursor: null })
      .mockResolvedValue({ items: [record('rec-1', 'Guest A')], hasMore: true, nextCursor: 'cursor-2' });
    renderPage();
    await screen.findByText('Guest A');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Guest B');
    expect(mocks.queryRecords.mock.calls[1][0]).toMatchObject({ startAfter: 'cursor-2' });
    expect(screen.getByText('Page 2 · 1 records')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await screen.findByText('Guest A');
    expect(mocks.queryRecords.mock.calls[2][0]).toMatchObject({ startAfter: null });
    expect(screen.getByText('Page 1 · 1 records')).toBeInTheDocument();
  });

  it('shows a clear-filters state when filters yield an empty page', async () => {
    renderPage('/app/records?status=DRAFT');
    expect(await screen.findByText('No records match these filters')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    await waitFor(() => {
      expect(lastCall()).toMatchObject({ status: null });
    });
  });
});

describe('bulk archive via trusted commands', () => {
  it('archives each selected record through its own ARCHIVE_RECORD command', async () => {
    mocks.queryRecords.mockResolvedValue({
      items: [record('rec-1', 'Guest A'), record('rec-2', 'Guest B')],
      hasMore: false,
      nextCursor: null,
    });
    mocks.archiveRecord.mockResolvedValue({ record: null, idempotent: false });
    renderPage();
    await screen.findByText('Guest A');
    fireEvent.click(screen.getByLabelText('Select record rec-1'));
    fireEvent.click(screen.getByLabelText('Select record rec-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Selected' }));
    await waitFor(() => expect(mocks.archiveRecord).toHaveBeenCalledTimes(2));
    expect(mocks.archiveRecord).toHaveBeenCalledWith({ workspaceId: 'workspace-1', recordId: 'rec-1' });
    expect(mocks.archiveRecord).toHaveBeenCalledWith({ workspaceId: 'workspace-1', recordId: 'rec-2' });
  });
});
