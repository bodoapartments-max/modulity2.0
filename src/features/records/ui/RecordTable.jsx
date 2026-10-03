/**
 * Record Table — generic table view for Records.
 *
 * Used by both Global List and Module-scoped List.
 * Built on the design-system DataGrid; renders canonical Record data with
 * selection, starring, and navigation.
 */
import { Link, useNavigate } from 'react-router-dom';
import { Badge, DataGrid } from '../../../design-system/index.js';
import { formatRecordListValue } from '../../../shared/presentation/recordListPresentation.js';
import { getRecordStatusVariant, getRecordPriorityVariant } from '../model.js';

const DEFAULT_COLUMNS = [
  { key: 'recordType', label: 'Type', scope: 'SYSTEM', sortable: false },
  { key: 'status', label: 'Status', scope: 'SYSTEM', sortable: false },
  { key: 'priority', label: 'Priority', scope: 'SYSTEM', sortable: false },
  { key: 'createdAt', label: 'Created', scope: 'SYSTEM', sortable: true },
  { key: 'updatedAt', label: 'Updated', scope: 'SYSTEM', sortable: false },
];

function SortableHeader({ column, sortField, sortDirection, onSort }) {
  if (!column.sortable || !onSort) return column.label;
  const active = sortField === column.key;
  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className="inline-flex items-center font-medium hover:text-neutral-900 select-none"
    >
      {column.label}
      {active
        ? <span className="text-primary-600 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        : <span className="text-neutral-300 ml-1">⇅</span>}
    </button>
  );
}

export default function RecordTable({
  records,
  loading,
  error = null,
  sortField,
  sortDirection,
  onSort,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onToggleStar,
  columns = DEFAULT_COLUMNS,
  entityLabels = {},
  moduleId = null,
  labelFor,
  emptyMessage = 'No records yet',
  emptyDescription,
  ariaLabel = 'Records',
}) {
  const navigate = useNavigate();
  const recordPath = (recordId) => `/app/records/${recordId}${moduleId ? `?fromModule=${moduleId}` : ''}`;
  const openRecord = (recordId) => navigate(recordPath(recordId));

  const firstDataColumnKey = (columns.find((column) => column.scope !== 'SYSTEM') || columns[0])?.key;

  const gridColumns = [
    {
      key: '__select',
      header: (
        <input
          type="checkbox"
          aria-label="Select all records"
          checked={records.length > 0 && selectedIds.size === records.length}
          onChange={onSelectAll}
          className="rounded border-neutral-300"
        />
      ),
      className: 'w-10',
      render: (record) => (
        <input
          type="checkbox"
          aria-label={`Select record ${record.recordId}`}
          checked={selectedIds.has(record.recordId)}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleSelect(record.recordId)}
          className="rounded border-neutral-300"
        />
      ),
    },
    {
      key: '__star',
      header: '',
      className: 'w-10',
      render: (record) => (
        <button
          type="button"
          title="Star"
          onClick={(event) => { event.stopPropagation(); onToggleStar(record.recordId); }}
          className="text-neutral-300 hover:text-yellow-500 transition-colors"
        >
          &#9733;
        </button>
      ),
    },
    ...columns.map((column) => ({
      key: column.key,
      header: <SortableHeader column={column} sortField={sortField} sortDirection={sortDirection} onSort={onSort} />,
      render: (record) => {
        if (column.render) return column.render(record);
        const value = formatRecordListValue(record, column, entityLabels);
        if (column.key === 'status') {
          return <Badge variant={getRecordStatusVariant(record.status)}>{value}</Badge>;
        }
        if (column.key === 'priority') {
          const variant = getRecordPriorityVariant(record.priority);
          return variant ? <Badge variant={variant}>{value}</Badge> : '—';
        }
        if (column.key === firstDataColumnKey) {
          return (
            <Link
              to={recordPath(record.recordId)}
              onClick={(event) => event.stopPropagation()}
              className="font-medium text-neutral-900 hover:text-primary-600"
            >
              {value}
            </Link>
          );
        }
        return value;
      },
    })),
    {
      key: '__id',
      header: 'ID',
      render: (record) => (
        <Link
          to={recordPath(record.recordId)}
          onClick={(event) => event.stopPropagation()}
          className="text-xs font-mono text-neutral-400 hover:text-primary-600"
        >
          {record.recordId?.slice(0, 8)}...
        </Link>
      ),
    },
  ];

  const ariaLabelFor = (record) => {
    const label = labelFor ? labelFor(record) : (record.recordType || 'Record');
    return `Open ${label} ${record.recordId}`;
  };

  return (
    <DataGrid
      columns={gridColumns}
      rows={records}
      rowKey={(record) => record.recordId}
      loading={loading}
      error={error}
      emptyMessage={emptyMessage}
      emptyDescription={emptyDescription}
      onRowClick={(record) => openRecord(record.recordId)}
      rowAriaLabel={ariaLabelFor}
      ariaLabel={ariaLabel}
    />
  );
}
