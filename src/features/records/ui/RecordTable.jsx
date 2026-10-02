/**
 * Record Table — generic table view for Records.
 *
 * Used by both Global List and Module-scoped List.
 * Renders canonical Record data with sorting, selection, and navigation.
 */
import { Link, useNavigate } from 'react-router-dom';
import { formatRecordListValue } from '../../../core/data/recordListPresentation.js';

const STATUS_COLORS = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-200 text-green-900',
  CANCELLED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-neutral-200 text-neutral-500',
};

const PRIORITY_COLORS = {
  LOW: 'text-neutral-500',
  MEDIUM: 'text-blue-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

const DEFAULT_COLUMNS = [
  { key: 'recordType', label: 'Type', scope: 'SYSTEM', sortable: false },
  { key: 'status', label: 'Status', scope: 'SYSTEM', sortable: false },
  { key: 'priority', label: 'Priority', scope: 'SYSTEM', sortable: false },
  { key: 'createdAt', label: 'Created', scope: 'SYSTEM', sortable: true },
  { key: 'updatedAt', label: 'Updated', scope: 'SYSTEM', sortable: false },
];

function SortIcon({ active, direction }) {
  if (!active) return <span className="text-neutral-300 ml-1">&uarr;&darr;</span>;
  return <span className="text-primary-600 ml-1">{direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function RecordTable({
  records,
  loading,
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
}) {
  const navigate = useNavigate();
  const recordPath = (recordId) => `/app/records/${recordId}${moduleId ? `?fromModule=${moduleId}` : ''}`;
  const openRecord = (recordId) => navigate(recordPath(recordId));
  if (loading && records.length === 0) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-neutral-100 rounded" />
        ))}
      </div>
    );
  }

  if (records.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === records.length && records.length > 0}
                  onChange={onSelectAll}
                  className="rounded border-neutral-300"
                />
              </th>
              <th className="px-4 py-3 text-left w-10"></th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-medium text-neutral-600 ${
                    col.sortable ? 'cursor-pointer hover:text-neutral-900 select-none' : ''
                  }`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable && (
                    <SortIcon active={sortField === col.key} direction={sortDirection} />
                  )}
                </th>
              ))}
              <th className="px-4 py-3 text-left font-medium text-neutral-600">ID</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={record.recordId}
                role="link"
                tabIndex={0}
                aria-label={`Open ${record.recordType || 'Record'} ${record.recordId}`}
                onClick={() => openRecord(record.recordId)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRecord(record.recordId); } }}
                className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 focus:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-colors"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(record.recordId)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleSelect(record.recordId)}
                    className="rounded border-neutral-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(event) => { event.stopPropagation(); onToggleStar(record.recordId); }}
                    className="text-neutral-300 hover:text-yellow-500 transition-colors"
                    title="Star"
                  >
                    &#9733;
                  </button>
                </td>
                {columns.map((column, index) => {
                  const value = formatRecordListValue(record, column, entityLabels);
                  return <td key={column.key} className="px-4 py-3 text-neutral-600">{column.key === 'status' ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[record.status] || ''}`}>{value}</span> : column.key === 'priority' ? <span className={`text-xs font-medium ${PRIORITY_COLORS[record.priority] || ''}`}>{value}</span> : index === 0 ? <Link to={recordPath(record.recordId)} onClick={(event) => event.stopPropagation()} className="font-medium text-neutral-900 hover:text-primary-600">{value}</Link> : value}</td>;
                })}
                <td className="px-4 py-3">
                  <Link
                    to={recordPath(record.recordId)}
                    onClick={(event) => event.stopPropagation()}
                    className="text-xs font-mono text-neutral-400 hover:text-primary-600"
                  >
                    {record.recordId?.slice(0, 8)}...
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
