/**
 * Record List Toolbar — filters and bulk actions for Record lists.
 */

import { RECORD_STATUSES, RECORD_PRIORITIES } from '../../../core/data/record.js';

export default function RecordListToolbar({
  statusFilter,
  priorityFilter,
  moduleFilter,
  onFilterChange,
  selectedCount,
  onBulkArchive,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => onFilterChange('status', e.target.value)}
        className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="">All Statuses</option>
        {Object.keys(RECORD_STATUSES).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Priority filter */}
      <select
        value={priorityFilter}
        onChange={(e) => onFilterChange('priority', e.target.value)}
        className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="">All Priorities</option>
        {Object.keys(RECORD_PRIORITIES).map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {/* Module filter — text input for now */}
      <input
        type="text"
        value={moduleFilter}
        onChange={(e) => onFilterChange('module', e.target.value)}
        placeholder="Filter by module ID..."
        className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
      />

      {/* Bulk actions */}
      {selectedCount > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-neutral-600">{selectedCount} selected</span>
          <button
            onClick={onBulkArchive}
            className="px-3 py-1.5 text-sm font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            Archive Selected
          </button>
        </div>
      )}
    </div>
  );
}
