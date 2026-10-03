/**
 * Modulity 2.0 — Field Registry
 *
 * Deterministic mapping from field type to React component.
 * Unknown types render an UnsupportedField error state.
 *
 * @module modules/forms/fieldRegistry
 */

import { FIELD_TYPES } from '../../core/data/entityType.js';
import { TextField } from './fields/TextField.jsx';
import { TextareaField } from './fields/TextareaField.jsx';
import { NumberField } from './fields/NumberField.jsx';
import { DateField } from './fields/DateField.jsx';
import { DateTimeField } from './fields/DateTimeField.jsx';
import { DateRangeField } from './fields/DateRangeField.jsx';
import { DateTimeRangeField } from './fields/DateTimeRangeField.jsx';
import { BooleanField } from './fields/BooleanField.jsx';
import { SelectField } from './fields/SelectField.jsx';
import { EmailField } from './fields/EmailField.jsx';
import { PhoneField } from './fields/PhoneField.jsx';
import { UrlField } from './fields/UrlField.jsx';
import { EntityReferenceField } from './fields/EntityReferenceField.jsx';
import { FileReferenceField } from './fields/FileReferenceField.jsx';
import { UnsupportedField } from './fields/UnsupportedField.jsx';

const FIELD_COMPONENT_MAP = {
  [FIELD_TYPES.TEXT]: TextField,
  [FIELD_TYPES.TEXTAREA]: TextareaField,
  [FIELD_TYPES.NUMBER]: NumberField,
  [FIELD_TYPES.DATE]: DateField,
  [FIELD_TYPES.DATETIME]: DateTimeField,
  [FIELD_TYPES.DATE_RANGE]: DateRangeField,
  [FIELD_TYPES.DATETIME_RANGE]: DateTimeRangeField,
  [FIELD_TYPES.BOOLEAN]: BooleanField,
  [FIELD_TYPES.SELECT]: SelectField,
  [FIELD_TYPES.EMAIL]: EmailField,
  [FIELD_TYPES.PHONE]: PhoneField,
  [FIELD_TYPES.URL]: UrlField,
  [FIELD_TYPES.ENTITY_REFERENCE]: EntityReferenceField,
  [FIELD_TYPES.FILE_REFERENCE]: FileReferenceField,
};

/**
 * Returns the React component for a given field type.
 * Falls back to UnsupportedField for unknown types.
 */
export function getFieldComponent(fieldType) {
  return FIELD_COMPONENT_MAP[fieldType] || UnsupportedField;
}

export function listRegisteredFieldTypes() {
  return Object.freeze(Object.keys(FIELD_COMPONENT_MAP).sort());
}

export { FIELD_COMPONENT_MAP };
