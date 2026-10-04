import { describe, expect, it } from 'vitest';
import { buildModulePresentation, selectableModules } from './model.js';

const categories = [
  { categoryId: 'cat-front', displayName: 'Front Office', status: 'ACTIVE', sortOrder: 1 },
  { categoryId: 'cat-hr', displayName: 'Human Resources', status: 'ACTIVE', sortOrder: 2 },
];
const modules = [
  { moduleId: 'm-checkin', name: 'Guest Check-in', moduleCode: 'GCI', status: 'ACTIVE', categoryId: 'cat-front' },
  { moduleId: 'm-res', name: 'Reservation', moduleCode: 'RES', status: 'ACTIVE', categoryId: 'cat-front' },
  { moduleId: 'm-holiday', name: 'Holiday Request', moduleCode: 'HREQ', status: 'ACTIVE', categoryId: 'cat-hr' },
  { moduleId: 'm-custom', name: 'My Custom Module', moduleCode: 'CUST', status: 'ACTIVE', categoryId: null },
  { moduleId: 'm-legacy', name: 'Legacy Form', moduleCode: 'LEG', status: 'ACTIVE', category: 'Old Text Area' },
];

describe('buildModulePresentation', () => {
  it('groups modules by canonical category; UNCATEGORIZED last, legacy free-text separate', () => {
    const { groups } = buildModulePresentation(modules, categories, null);
    expect(groups.map((g) => g.categoryId)).toEqual(['LEGACY::OLD TEXT AREA', 'cat-front', 'cat-hr', 'UNCATEGORIZED']);
    expect(groups[3].modules.map((m) => m.moduleId)).toEqual(['m-custom']);
  });

  it('uncategorized legacy modules keep their legacy label as the bucket name', () => {
    const { groups } = buildModulePresentation([modules[4]], categories, null);
    expect(groups[0].displayName).toBe('Old Text Area');
    expect(groups[0].categoryId).toBe('LEGACY::OLD TEXT AREA');
  });

  it('personal selection only affects visibility, never discoverability', () => {
    const prefs = { selectedModuleIds: ['m-checkin'], moduleOrder: [], viewMode: 'GROUPED' };
    const mine = buildModulePresentation(modules, categories, prefs);
    const all = buildModulePresentation(modules, categories, { selectedModuleIds: [], moduleOrder: [], viewMode: 'GROUPED' });
    expect(mine.flat.map((m) => m.moduleId)).toEqual(['m-checkin']);
    expect(all.flat).toHaveLength(5);
  });

  it('applies personal order across groups', () => {
    const prefs = { selectedModuleIds: [], moduleOrder: ['m-holiday', 'm-checkin'], viewMode: 'FLAT' };
    const { flat } = buildModulePresentation(modules, categories, prefs);
    expect(flat.map((m) => m.moduleId).slice(0, 2)).toEqual(['m-holiday', 'm-checkin']);
  });

  it('search filters across name/code/description', () => {
    const { flat } = buildModulePresentation(modules, categories, null, { search: 'vehicle' });
    expect(flat).toHaveLength(0);
    const found = buildModulePresentation(modules, categories, null, { search: 'res' });
    expect(found.flat.map((m) => m.moduleId)).toContain('m-res');
  });

  it('category filter keeps only the selected bucket', () => {
    const { groups } = buildModulePresentation(modules, categories, null, { categoryId: 'cat-front' });
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryId).toBe('cat-front');
  });

  it('selectableModules excludes ARCHIVED modules', () => {
    const withArchived = [...modules, { moduleId: 'm-arch', name: 'Old', moduleCode: 'OLD', status: 'ARCHIVED' }];
    expect(selectableModules(withArchived).map((m) => m.moduleId)).not.toContain('m-arch');
  });
});
