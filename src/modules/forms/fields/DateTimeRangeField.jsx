import { FieldWrapper } from './FieldWrapper.jsx';

const HAS_TIMEZONE = /Z|[+-]\d{2}:\d{2}$/;

function toInputValue(value) {
  if (!value) return '';
  if (HAS_TIMEZONE.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  }
  return value.slice(0, 16);
}

function toCanonical(raw) {
  if (!raw) return '';
  return `${raw}:00`;
}

export function DateTimeRangeField({ field, value, onChange, error, disabled }) {
  const { start = '', end = '' } = value || {};

  function handleStartChange(e) {
    onChange(field.key, { start: toCanonical(e.target.value), end });
  }

  function handleEndChange(e) {
    onChange(field.key, { start, end: toCanonical(e.target.value) });
  }

  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
    error ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300'
  } ${disabled ? 'cursor-not-allowed bg-neutral-100' : 'bg-white'}`;

  return (
    <FieldWrapper field={field} error={error}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">From</label>
          <input
            type="datetime-local"
            lang="en-GB"
            value={toInputValue(start)}
            onChange={handleStartChange}
            disabled={disabled}
            required={field.required}
            aria-label={`${field.label} from`}
            aria-invalid={!!error}
            className={inputClass}
          />
        </div>
        <span className="hidden text-sm text-neutral-400 sm:mt-5 sm:block">–</span>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Till</label>
          <input
            type="datetime-local"
            lang="en-GB"
            value={toInputValue(end)}
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
