/**
 * Modulity 2.0 — Core Entity Type Definitions
 *
 * Platform-defined Entity Types reusable across all industries.
 * These are seeded into each workspace on initialization.
 *
 * @module core/data/coreEntityTypes
 */

import { ENTITY_TYPE_CATEGORIES, ENTITY_TYPE_STATUSES } from './entityType.js';

/**
 * Core Entity Type templates (no workspaceId — applied per workspace).
 * typeId uses `core:` prefix for deterministic seeding.
 */
export const CORE_ENTITY_TYPES = Object.freeze([
  {
    typeId: 'core:person',
    code: 'PERSON',
    name: 'Person',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A human individual referenced by the platform.',
    icon: 'user',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: false },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
    ],
  },
  {
    typeId: 'core:employee',
    code: 'EMPLOYEE',
    name: 'Employee',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A person employed by the organization.',
    icon: 'briefcase',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', required: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true },
      { key: 'position', label: 'Position', type: 'text', required: false },
      { key: 'department', label: 'Department', type: 'text', required: false },
      { key: 'startDate', label: 'Start Date', type: 'date', required: false },
    ],
  },
  {
    typeId: 'core:customer',
    code: 'CUSTOMER',
    name: 'Customer',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A person or organization that is a customer.',
    icon: 'users',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text', required: false },
      { key: 'phone', label: 'Phone', type: 'text', required: false },
      { key: 'company', label: 'Company', type: 'text', required: false },
    ],
  },
  {
    typeId: 'core:supplier',
    code: 'SUPPLIER',
    name: 'Supplier',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A supplier providing goods or services.',
    icon: 'truck',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'contactEmail', label: 'Contact Email', type: 'text', required: false },
      { key: 'contactPhone', label: 'Contact Phone', type: 'text', required: false },
      { key: 'address', label: 'Address', type: 'text', required: false },
    ],
  },
  {
    typeId: 'core:vehicle',
    code: 'VEHICLE',
    name: 'Vehicle',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A vehicle owned or operated by the organization.',
    icon: 'car',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'registrationNumber', label: 'Registration Number', type: 'text', required: true },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text', required: false },
      { key: 'model', label: 'Model', type: 'text', required: false },
      { key: 'year', label: 'Year', type: 'number', required: false },
    ],
  },
  {
    typeId: 'core:equipment',
    code: 'EQUIPMENT',
    name: 'Equipment',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'Physical equipment or machinery.',
    icon: 'tool',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'serialNumber', label: 'Serial Number', type: 'text', required: false },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text', required: false },
    ],
  },
  {
    typeId: 'core:location',
    code: 'LOCATION',
    name: 'Location',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A named physical or logical location.',
    icon: 'map-pin',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'address', label: 'Address', type: 'text', required: false },
      { key: 'floor', label: 'Floor', type: 'text', required: false },
      { key: 'building', label: 'Building', type: 'text', required: false },
    ],
  },
  {
    typeId: 'core:document',
    code: 'DOCUMENT',
    name: 'Document',
    category: ENTITY_TYPE_CATEGORIES.CORE,
    description: 'A document or file tracked as a business entity.',
    icon: 'file-text',
    status: ENTITY_TYPE_STATUSES.ACTIVE,
    schemaVersion: '1.0.0',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'documentType', label: 'Document Type', type: 'text', required: false },
      { key: 'issueDate', label: 'Issue Date', type: 'date', required: false },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date', required: false },
    ],
  },
]);

/**
 * Returns a core entity type template by code.
 */
export function getCoreEntityType(code) {
  return CORE_ENTITY_TYPES.find((t) => t.code === code) || null;
}
