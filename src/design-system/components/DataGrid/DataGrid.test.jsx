import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataGrid from './DataGrid.jsx';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'value', header: 'Value' },
];
const rows = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

describe('DataGrid', () => {
  it('renders rows from columns', () => {
    render(<DataGrid columns={columns} rows={rows} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '20' })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<DataGrid columns={columns} rows={[]} loading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<DataGrid columns={columns} rows={[]} />);
    expect(screen.getByRole('heading', { name: 'No items' })).toBeInTheDocument();
  });

  it('calls onRowClick', () => {
    const onRowClick = vi.fn();
    render(<DataGrid columns={columns} rows={rows} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole('cell', { name: 'Alpha' }));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('uses column render function', () => {
    render(<DataGrid columns={[{ key: 'x', header: 'X', render: (row) => `v:${row.value}` }]} rows={rows} />);
    expect(screen.getByRole('cell', { name: 'v:10' })).toBeInTheDocument();
  });

  it('applies rowAriaLabel to clickable rows', () => {
    render(
      <DataGrid
        columns={columns}
        rows={rows}
        onRowClick={() => {}}
        rowAriaLabel={(row) => `Open ${row.name}`}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Beta' })).toBeInTheDocument();
  });

  it('applies rowClassName to rows', () => {
    render(
      <DataGrid
        columns={columns}
        rows={rows}
        rowClassName={(row) => (row.id === '1' ? 'row-first' : '')}
      />,
    );
    const firstRow = screen.getByRole('cell', { name: 'Alpha' }).closest('tr');
    const secondRow = screen.getByRole('cell', { name: 'Beta' }).closest('tr');
    expect(firstRow.className).toContain('row-first');
    expect(secondRow.className).not.toContain('row-first');
  });
});
