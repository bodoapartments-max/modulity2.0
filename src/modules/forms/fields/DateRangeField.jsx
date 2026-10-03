import { FieldWrapper } from './FieldWrapper.jsx';

export function DateRangeField({ field, value, onChange, error, disabled }) {
  const { start = '', end = '' } = value || {};

  function handleStartChange(e) {
    onChange(field.key, { start: e.target.value, end });
  }

  function handleEndChange(e) {
    onChange(field.key, { start, end: e.target.value });
  }

  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
    error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
  } ${disabled ? 'cursor-not-allowed bg-neutral-100' : 'bg-white'}`;

  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">From</label>
          <input
            type="date"
            lang="en-GB"
            value={start}
            onChange={handleStartChange}
            disabled={disabled}
            required={field.required}
            aria-label={`${field.label} from`}
            aria-invalid={!!error}
            className={inputClass}
          />
        </div>
        <span className="mt-5 text-sm text-neutral-400">–</span>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Till</label>
          <input
            type="date"
            lang="en-GB"
            value={end}
            onChange={handleEndChange}
            disabled={disabled}
            required={field.required}
            aria-label={`${field.label} till`}
            aria-invalid={!!error}
            className={inputClass}
          />
        </div>
      </div>
    </FieldWrapper>
  );
}
