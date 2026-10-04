/**
 * Modulity 2.0 — Generic Form Renderer
 *
 * ONE generic Form Renderer that renders any Module's form.
 * Chooses field components based on field.type via the Field Registry.
 *
 * Bad: RoomInspectionForm.jsx, VehicleInspectionForm.jsx
 * Good: FormRenderer + FieldRegistry + schema-driven rendering
 *
 * @module modules/forms/FormRenderer
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { getFieldComponent } from './fieldRegistry.js';
import { validateFormValues } from './formSchemaValidator.js';
import { FormFieldServicesProvider } from './FormFieldServicesContext.jsx';

/**
 * @param {Object} props
 * @param {import('../module.js').FormSchema} props.schema — the form schema
 * @param {Object} [props.initialValues] — pre-filled values (for editing drafts)
 * @param {function} props.onSubmit — called with validated values
 * @param {function} [props.onSaveDraft] — called with current values (no validation required)
 * @param {function} [props.onValuesChange] — called with current values on every change (no validation)
 * @param {boolean} [props.validateOnSubmit=true] — when false, submit skips schema validation (draft editing)
 * @param {string} props.workspaceId — current workspace for entity queries
 * @param {boolean} [props.disabled] — disable all fields
 * @param {string} [props.submitLabel] — label for submit button
 * @param {boolean} [props.loading] — show loading state
 * @param {boolean} [props.hideActions] — render fields only (read-only viewer mode)
 */
export function FormRenderer({
  schema,
  initialValues = {},
  onSubmit,
  onSaveDraft,
  onValuesChange,
  validateOnSubmit = true,
  workspaceId,
  disabled = false,
  submitLabel = 'Submit',
  loading = false,
  fieldServices = null,
  hideActions = false,
}) {
  const [values, setValues] = useState({ ...initialValues });
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const formRef = useRef(null);

  const fields = useMemo(() => schema?.fields || [], [schema]);

  const handleChange = useCallback((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    // Clear field error on change
    setErrors((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
  }, []);

  // Notify listeners (e.g. draft autosave) after values actually commit.
  const notifyRef = useRef(onValuesChange);
  notifyRef.current = onValuesChange;
  const lastNotified = useRef(values);
  useEffect(() => {
    if (lastNotified.current !== values) {
      lastNotified.current = values;
      notifyRef.current?.(values);
    }
  }, [values]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    // Clean undefined values
    const cleanValues = {};
    for (const [key, val] of Object.entries(values)) {
      if (val !== undefined && val !== '') {
        cleanValues[key] = val;
      }
    }

    const validation = validateOnSubmit
      ? validateFormValues(cleanValues, fields)
      : { valid: true, errors: {} };
    if (!validation.valid) {
      setErrors(validation.errors);
      // Focus first errored field
      const firstErrorKey = Object.keys(validation.errors)[0];
      if (firstErrorKey && formRef.current) {
        const el = formRef.current.querySelector(`#field-${firstErrorKey}`);
        if (el) el.focus();
      }
      return;
    }

    setErrors({});
    onSubmit(cleanValues);
  }, [values, fields, onSubmit, validateOnSubmit]);

  const handleSaveDraft = useCallback(() => {
    if (onSaveDraft) {
      const cleanValues = {};
      for (const [key, val] of Object.entries(values)) {
        if (val !== undefined && val !== '') {
          cleanValues[key] = val;
        }
      }
      onSaveDraft(cleanValues);
    }
  }, [values, onSaveDraft]);

  const isDisabled = disabled || loading;

  return (
    <FormFieldServicesProvider services={fieldServices}>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-1">
      <div className="flex flex-wrap -mx-1">
        {fields.map((field) => {
          const FieldComponent = getFieldComponent(field.type);
          return (
            <FieldComponent
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={handleChange}
              error={errors[field.key]}
              disabled={isDisabled}
              workspaceId={workspaceId}
            />
          );
        })}
      </div>

      {Object.keys(errors).length > 0 && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Please fix the errors above before submitting.
        </div>
      )}

      {!hideActions && (
      <div className="flex items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={isDisabled}
          className={`px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
            isDisabled
              ? 'bg-primary-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {loading ? 'Submitting...' : submitLabel}
        </button>

        {onSaveDraft && (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isDisabled || !dirty}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
              isDisabled || !dirty
                ? 'text-neutral-400 border border-neutral-200 cursor-not-allowed'
                : 'text-neutral-700 border border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            Save Draft
          </button>
        )}
      </div>
      )}
    </form>
    </FormFieldServicesProvider>
  );
}
