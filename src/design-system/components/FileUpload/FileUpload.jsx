/**
 * FileUpload
 *
 * Presentation-only file input primitive. This is NOT the Document Engine or
 * Attachment architecture; it only surfaces file selection UX and forwards files
 * to the feature's onChange handler.
 */
import { useRef } from 'react';
import Button from '../Button/Button.jsx';

export default function FileUpload({
  id,
  accept,
  multiple = false,
  disabled = false,
  files = [],
  maxFiles,
  maxSizeBytes,
  error,
  helperText,
  onChange,
  className = '',
}) {
  const inputRef = useRef(null);

  const handleChange = (event) => {
    const selected = Array.from(event.target.files || []);
    if (!onChange) return;
    if (maxFiles && selected.length > maxFiles) {
      onChange({ files: [], error: `Maximum ${maxFiles} file(s) allowed.` });
      return;
    }
    if (maxSizeBytes && selected.some((file) => file.size > maxSizeBytes)) {
      onChange({ files: [], error: `One or more files exceed the size limit.` });
      return;
    }
    onChange({ files: multiple ? [...files, ...selected] : selected.slice(0, 1) });
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index) => {
    const next = [...files];
    next.splice(index, 1);
    onChange({ files: next });
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        aria-describedby={helperText ? `${id}-helper` : undefined}
      />
      <label htmlFor={id}>
        <Button type="button" variant="secondary" disabled={disabled} as="span">
          Choose file{multiple ? 's' : ''}
        </Button>
      </label>
      {helperText && (
        <p id={`${id}-helper`} className="mt-1 text-xs text-neutral-500">
          {helperText}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between text-sm text-neutral-700">
              <span className="truncate">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
