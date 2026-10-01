import { describe, it, expect } from 'vitest';
import { createOrganization, ORGANIZATION_TYPES } from './organization.js';

const base = {
  organizationId: 'org-1',
  name: 'Acme Corp',
  type: ORGANIZATION_TYPES.COMPANY,
  country: 'HU',
  createdByUserId: 'user-1',
};

describe('createOrganization', () => {
  it('creates a frozen organization with correct fields', () => {
    const org = createOrganization(base);
    expect(Object.isFrozen(org)).toBe(true);
    expect(org.organizationId).toBe('org-1');
    expect(org.name).toBe('Acme Corp');
    expect(org.type).toBe(ORGANIZATION_TYPES.COMPANY);
    expect(org.country).toBe('HU');
    expect(org.description).toBe('');
    expect(org.createdByUserId).toBe('user-1');
    expect(org.createdAt).toBeTruthy();
    expect(org.updatedAt).toBeTruthy();
  });

  it('throws when organizationId is missing', () => {
    expect(() => createOrganization({ ...base, organizationId: undefined })).toThrow(/organizationId/);
  });

  it('throws when name is empty', () => {
    expect(() => createOrganization({ ...base, name: '  ' })).toThrow(/name is required/i);
  });

  it('throws for invalid type', () => {
    expect(() => createOrganization({ ...base, type: 'NOPE' })).toThrow(/Invalid organization type/);
  });

  it('throws when country is empty', () => {
    expect(() => createOrganization({ ...base, country: ' ' })).toThrow(/Country is required/);
  });

  it('throws when createdByUserId is missing', () => {
    expect(() => createOrganization({ ...base, createdByUserId: undefined })).toThrow(/createdByUserId/);
  });

  it('trims name, country and description', () => {
    const org = createOrganization({ ...base, name: ' Acme ', country: ' HU ', description: '  Desc  ' });
    expect(org.name).toBe('Acme');
    expect(org.country).toBe('HU');
    expect(org.description).toBe('Desc');
  });
});
