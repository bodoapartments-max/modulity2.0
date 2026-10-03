const SYSTEM_COLUMNS = Object.freeze([
  { key: 'status', label: 'Status', scope: 'SYSTEM', sortable: false },
  { key: 'createdAt', label: 'Created', scope: 'SYSTEM', sortable: true },
]);

export function buildModuleRecordColumns(moduleDefinition) {
  const fields = moduleDefinition?.formSchema?.fields || [];
  const configured = moduleDefinition?.displayConfig?.listFields || [];
  const selected = (configured.length ? configured.map((key) => fields.find((field) => field.key === key)).filter(Boolean) : fields.slice(0, 4));
  return Object.freeze([...selected.map((field) => Object.freeze({ key: field.key, label: field.label, type: field.type, scope: 'DATA', sortable: false })), ...SYSTEM_COLUMNS]);
}

export function formatRecordListValue(record, column, entityLabels = {}) {
  const value = column.scope === 'DATA' ? record.data?.[column.key] : record[column.key];
  if (value === undefined || value === null || value === '') return '—';
  if (column.type === 'entity-reference' && typeof value === 'object') return entityLabels[value.entityId] || value.entityId;
  if (column.type === 'boolean') return value ? 'Yes' : 'No';
  if (column.type === 'date-range' && typeof value === 'object' && value !== null && value.start && value.end) {
    return `${new Date(value.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(value.end).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  }
  if (column.type === 'datetime-range' && typeof value === 'object' && value !== null && value.start && value.end) {
    const sameDay = new Date(value.start).toDateString() === new Date(value.end).toDateString();
    const startDate = new Date(value.start);
    const endDate = new Date(value.end);
    if (sameDay) return `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}–${endDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    return `${startDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} → ${endDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  }
  if (column.type === 'date' || column.type === 'datetime' || ['createdAt', 'updatedAt', 'submittedAt'].includes(column.key)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
