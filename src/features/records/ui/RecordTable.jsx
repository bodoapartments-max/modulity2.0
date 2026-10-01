/**
 * Record Table — generic table view for Records.
 *
 * Used by both Global List and Module-scoped List.
 * Renders canonical Record data with sorting, selection, and navigation.
 */
import { Link } from 'react-router-dom';

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

const COLUMNS = [
  { key: 'recordType', label: 'Type', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'priority', label: 'Priority', sortable: true },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'updatedAt', label: 'Updated', sortable: true },
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
}) {
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
              {COLUMNS.map((col) => (
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
                className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(record.recordId)}
                    onChange={() => onToggleSelect(record.recordId)}
                    className="rounded border-neutral-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleStar(record.recordId)}
                    className="text-neutral-300 hover:text-yellow-500 transition-colors"
                    title="Star"
                  >
                    &#9733;
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/app/records/${record.recordId}`}
                    className="font-medium text-neutral-900 hover:text-primary-600"
                  >
                    {record.recordType}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[record.status] || ''}`}>
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {record.priority ? (
                    <span className={`text-xs font-medium ${PRIORITY_COLORS[record.priority] || ''}`}>
                      {record.priority}
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {formatDate(record.createdAt)}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {formatDate(record.updatedAt)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/app/records/${record.recordId}`}
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

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return ts;
  }
}
