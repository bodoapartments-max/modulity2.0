import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from './Table.jsx';

describe('Table', () => {
  it('renders a semantic table with rows and cells', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alpha</TableCell>
            <TableCell>1</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Alpha/ })).toBeInTheDocument();
  });
});
