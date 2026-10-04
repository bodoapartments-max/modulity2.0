import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import CreateLedgerBookPage from './CreateLedgerBookPage.jsx';

const mocks = vi.hoisted(() => ({
  listModules: vi.fn(),
  createBook: vi.fn(),
  navigateSpy: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    module: { listModules: mocks.listModules },
    ledgerCommand: { createBook: mocks.createBook },
  },
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigateSpy };
});

const modules = [
  { moduleId: 'mod-veh', name: 'Vehicle Inspection', moduleCode: 'VEHINS', status: 'ACTIVE' },
  { moduleId: 'mod-room', name: 'Room Inspection', moduleCode: 'ROOMINS', status: 'ACTIVE' },
  { moduleId: 'mod-draft', name: 'Unpublished Draft', moduleCode: 'DRAFTX', status: 'DRAFT' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/ledger/new']}>
      <AuthContext.Provider value={{ user: { uid: 'user-1' } }}>
        <WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1' } }}>
          <Routes>
            <Route path="/app/ledger/new" element={<CreateLedgerBookPage />} />
          </Routes>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('CreateLedgerBookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listModules.mockResolvedValue(modules);
    mocks.createBook.mockResolvedValue({ book: { ledgerBookId: 'lb-1' } });
  });

  it('offers only non-draft Modules as sources and pre-fills from the selection', async () => {
    renderPage();
    const source = await screen.findByLabelText('Source');
    const options = within(source);
    expect(options.getByRole('option', { name: /Vehicle Inspection \(VEHINS\)/ })).toBeTruthy();
    expect(options.queryByRole('option', { name: /Unpublished Draft/ })).toBeNull();

    fireEvent.change(source, { target: { value: 'mod-veh' } });
    expect(screen.getByLabelText('Name *').value).toBe('Vehicle Inspection Register');
    expect(screen.getByLabelText('Reference Prefix').value).toBe('VEHINS');
    expect(screen.getByLabelText('Ledger Code *').value).toBe('VEHINS_LEDGER');
  });

  it('keeps user-typed code/prefix when the source changes afterwards', async () => {
    renderPage();
    const source = await screen.findByLabelText('Source');
    fireEvent.change(screen.getByLabelText('Ledger Code *'), { target: { value: 'MYCUSTOM' } });
    fireEvent.change(screen.getByLabelText('Reference Prefix'), { target: { value: 'MINE' } });
    fireEvent.change(source, { target: { value: 'mod-room' } });
    expect(screen.getByLabelText('Ledger Code *').value).toBe('MYCUSTOM');
    expect(screen.getByLabelText('Reference Prefix').value).toBe('MINE');
    expect(screen.getByLabelText('Name *').value).toBe('Room Inspection Register');
  });

  it('sends the typed MODULE sourceDefinition through the trusted command', async () => {
    renderPage();
    const source = await screen.findByLabelText('Source');
    fireEvent.change(source, { target: { value: 'mod-veh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Ledger Book' }));
    await waitFor(() => expect(mocks.createBook).toHaveBeenCalled());
    const args = mocks.createBook.mock.calls[0][0];
    expect(args.sourceDefinition).toEqual({ type: 'MODULE', moduleId: 'mod-veh' });
    expect(mocks.navigateSpy).toHaveBeenCalledWith('/app/ledger/lb-1');
  });

  it('creates a source-less manual book when no source is selected', async () => {
    renderPage();
    await screen.findByLabelText('Source');
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Ad-hoc Register' } });
    fireEvent.change(screen.getByLabelText('Ledger Code *'), { target: { value: 'ADHOC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Ledger Book' }));
    await waitFor(() => expect(mocks.createBook).toHaveBeenCalled());
    expect(mocks.createBook.mock.calls[0][0].sourceDefinition).toBeNull();
  });

  it('surfaces trusted server rejections inline', async () => {
    mocks.createBook.mockRejectedValue(new Error('Ledger code "X" is already in use.'));
    renderPage();
    await screen.findByLabelText('Source');
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Ledger Code *'), { target: { value: 'XCODE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Ledger Book' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in use');
  });
});
