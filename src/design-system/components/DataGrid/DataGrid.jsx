/**
 * DataGrid
 *
 * Higher-level reusable structured dataset presentation primitive.
 * Composes Table and accepts rows/columns from feature code.
 */
import LoadingState from '../LoadingState/LoadingState.jsx';
import EmptyState from '../EmptyState/EmptyState.jsx';
import ErrorState from '../ErrorState/ErrorState.jsx';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../Table/Table.jsx';

export default function DataGrid({
  columns,
  rows,
  rowKey = (row) => row.id ?? row.key,
  loading = false,
  emptyMessage = 'No items',
  emptyDescription = 'There is nothing to show here yet.',
  error = null,
  onRowClick,
  ariaLabel = 'Data grid',
}) {
  if (error) return <ErrorState title="Unable to load data" message={error} />;
  if (loading && rows.length === 0) return <LoadingState message="Loading…" />;
  if (!loading && rows.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <Table aria-label={ariaLabel}>
        <TableHeader className="border-b border-neutral-200 bg-neutral-50">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row);
            const clickable = Boolean(onRowClick) && !row.disabled;
            return (
              <TableRow
                key={key}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={clickable ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                className={`
                  border-b border-neutral-100
                  ${clickable ? 'cursor-pointer hover:bg-neutral-50 focus:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500' : ''}
                `}
              >
                {columns.map((column) => (
                  <TableCell key={`${key}-${column.key}`} className={column.cellClassName}>
                    {column.render ? column.render(row) : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
