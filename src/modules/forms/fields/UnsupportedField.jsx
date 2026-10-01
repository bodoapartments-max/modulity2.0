import { FieldWrapper } from './FieldWrapper.jsx';

export function UnsupportedField({ field }) {
  return (
    <FieldWrapper field={field} error={`Unsupported field type: ${field.type}`}>
      <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Field type &quot;{field.type}&quot; is not supported by the current Form Renderer.
      </div>
    </FieldWrapper>
  );
}
