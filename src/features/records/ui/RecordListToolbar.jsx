/**
 * Record List Toolbar — filters, sort, search, and bulk actions for Record lists.
 * Built on design-system Select/Input/Button primitives.
 */

import { RECORD_STATUSES, RECORD_PRIORITIES } from '../../../core/data/record.js';
import { RECORD_SORT_OPTIONS } from '../model.js';
import { Button, Input, Label, Select } from '../../../design-system/index.js';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...Object.keys(RECORD_STATUSES).map((status) => ({ value: status, label: status })),
];
const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  ...Object.keys(RECORD_PRIORITIES).map((priority) => ({ value: priority, label: priority })),
];

export default function RecordListToolbar({
  statusFilter,
  priorityFilter,
  moduleFilter,
  moduleOptions = [],
  sortValue,
  fromDate,
  toDate,
  searchTerm,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  selectedCount,
  onBulkArchive,
}) {
  return (
    <div className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Status"
          aria-label="Status filter"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(event) => onFilterChange('status', event.target.value)}
        />
        <Select
          label="Priority"
          aria-label="Priority filter"
          options={PRIORITY_OPTIONS}
          value={priorityFilter}
          onChange={(event) => onFilterChange('priority', event.target.value)}
        />
        <Select
          label="Module"
          aria-label="Module filter"
          options={[{ value: '', label: 'All Modules' }, ...moduleOptions]}
          value={moduleFilter}
          onChange={(event) => onFilterChange('module', event.target.value)}
        />
        <Select
          label="Sort"
          aria-label="Sort records"
          options={RECORD_SORT_OPTIONS}
          value={sortValue}
          onChange={(event) => onFilterChange('sort', event.target.value)}
        />
        <div>
          <Label htmlFor="record-filter-from">Created from</Label>
          <Input
            id="record-filter-from"
            type="date"
            aria-label="Created from"
            className="mt-1"
            value={fromDate}
            onChange={(event) => onFilterChange('from', event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="record-filter-to">Created to</Label>
          <Input
            id="record-filter-to"
            type="date"
            aria-label="Created to"
            className="mt-1"
            value={toDate}
            onChange={(event) => onFilterChange('to', event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="record-search">Search</Label>
          <Input
            id="record-search"
            type="search"
            aria-label="Search records"
            className="mt-1"
            placeholder="Search loaded records…"
            value={searchTerm}
            onChange={(event) => onFilterChange('q', event.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">Searches the records loaded on this page</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        {selectedCount > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-neutral-600">{selectedCount} selected</span>
            <Button type="button" variant="outline" size="sm" onClick={onBulkArchive}>
              Archive Selected
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
