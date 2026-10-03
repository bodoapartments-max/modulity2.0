/**
 * WorksetSelector
 *
 * Controlled design-system primitive for choosing the active workspace workset.
 * Does not fetch data; the consumer provides the workset list and change handler.
 */

export default function WorksetSelector({ id, name, value, worksets = [], onChange, className = '' }) {
  return (
    <select
      id={id}
      name={name}
      value={value || ''}
      onChange={(event) => onChange(event.target.value || null)}
      className={`rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700 ${className}`}
      aria-label="Active Workset"
    >
      <option value="">All Modules</option>
      {worksets.map((workset) => (
        <option key={workset.worksetId} value={workset.worksetId}>{workset.name}</option>
      ))}
    </select>
  );
}
