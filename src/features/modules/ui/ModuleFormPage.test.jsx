import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../app/providers/AuthProvider.jsx';
import { WorkspaceContext } from '../../../app/providers/WorkspaceProvider.jsx';
import ModuleFormPage from './ModuleFormPage.jsx';

const mocks = vi.hoisted(() => ({
  getModule: vi.fn(),
  submitModuleRecord: vi.fn(),
  saveDraft: vi.fn(),
  listEntities: vi.fn(),
}));
vi.mock('../../../infrastructure/services.js', () => ({
  default: {
    module: { getModule: mocks.getModule },
    moduleSubmission: {
      submitModuleRecord: mocks.submitModuleRecord,
      saveDraft: mocks.saveDraft,
    },
    entity: { listEntities: mocks.listEntities },
  },
}));

const moduleDef = {
  moduleId: 'reservation',
  name: 'Reservation',
  status: 'ACTIVE',
  version: 1,
  formSchema: {
    fields: [
      { key: 'guest', label: 'Guest', type: 'text' },
      { key: 'stay', label: 'Stay', type: 'date-range' },
    ],
  },
};

function renderPage(state = null) {
  mocks.getModule.mockResolvedValue(moduleDef);
  mocks.listEntities.mockResolvedValue([]);
  mocks.submitModuleRecord.mockResolvedValue({ recordId: 'rec-9', status: 'SUBMITTED' });
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/app/modules/reservation/form', state }]}>
      <AuthContext.Provider value={{ user: { userId: 'user-1' } }}>
        <WorkspaceContext.Provider value={{ currentWorkspace: { workspaceId: 'ws-1' } }}>
          <Routes>
            <Route path="/app/modules/:moduleId/form" element={<ModuleFormPage />} />
          </Routes>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Module Form — copy prefill', () => {
  it('pre-fills values from a copied record and explains that a new Record is created', async () => {
    renderPage({
      prefillValues: { guest: 'Guest A', stay: { start: '2026-11-01', end: '2026-11-03' } },
      copySourceLabel: 'Guest A',
    });

    expect((await screen.findByLabelText(/Guest/)).value).toBe('Guest A');
    expect(screen.getByRole('note')).toHaveTextContent(/Pre-filled with values copied from “Guest A”/);

    fireEvent.change(screen.getByLabelText(/Guest/), { target: { value: 'Guest B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/Record Created/)).toBeInTheDocument();
    expect(mocks.submitModuleRecord).toHaveBeenCalledTimes(1);
    const call = mocks.submitModuleRecord.mock.calls[0][0];
    expect(call.values.guest).toBe('Guest B');
    expect(call.values.stay).toEqual({ start: '2026-11-01', end: '2026-11-03' });
    // Prefill never carries identity/provenance — the trusted CREATE builds them server-side.
    expect(call.values.recordId).toBeUndefined();
    expect(call.values.createdBy).toBeUndefined();
  });

  it('renders an empty form without prefill state', async () => {
    renderPage();
    expect((await screen.findByLabelText(/Guest/)).value).toBe('');
    expect(screen.queryByRole('note')).toBeNull();
  });
});
