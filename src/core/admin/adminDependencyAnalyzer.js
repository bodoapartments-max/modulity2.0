/**
 * Modulity 2.0 — Administration Dependency Analyzer (typed, closed registry)
 *
 * Hard Delete safety: probe the resource against the closed dependency-kind
 * registry. No arbitrary queries, ever. Future references (Attachments,
 * Tasks, Workflow, Documents, Scheduling…) add new Kinds here — never
 * arbitrary collection paths.
 */
export const ADMIN_DEPENDENCY_KINDS = Object.freeze({
  // Entity Type ← Entities / Modules' fields / primaryEntityTypeId
  ENTITY_TYPE_HAS_ENTITIES: 'ENTITY_TYPE_HAS_ENTITIES',
  ENTITY_TYPE_USED_BY_MODULE_SCHEMA: 'ENTITY_TYPE_USED_BY_MODULE_SCHEMA',
  ENTITY_TYPE_PRIMARY_OF_MODULE: 'ENTITY_TYPE_PRIMARY_OF_MODULE',
  // Entity ← Records / Relationships
  ENTITY_REFERENCED_BY_RECORDS: 'ENTITY_REFERENCED_BY_RECORDS',
  ENTITY_IN_RELATIONSHIPS: 'ENTITY_IN_RELATIONSHIPS',
  // Module ← Records / versions / Ledger / worksets / widgets / reports
  MODULE_HAS_RECORDS: 'MODULE_HAS_RECORDS',
  MODULE_HAS_VERSIONS: 'MODULE_HAS_VERSIONS',
  MODULE_USED_BY_LEDGER_BOOK: 'MODULE_USED_BY_LEDGER_BOOK',
  MODULE_IN_WORKSET: 'MODULE_IN_WORKSET',
  MODULE_IN_WIDGET: 'MODULE_IN_WIDGET',
  MODULE_IN_REPORT: 'MODULE_IN_REPORT',
  // Module Category ← Modules (categoryId link)
  CATEGORY_USED_BY_MODULES: 'CATEGORY_USED_BY_MODULES',
});

/**
 * Kind sets per resource. Kept explicit so the analyzer stays typed and
 * bounded; adding future dependency kinds means extending THIS list.
 */
export const ADMIN_DEPENDENCIES_BY_RESOURCE = Object.freeze({
  ENTITY_TYPE: Object.freeze([
    ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_HAS_ENTITIES,
    ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_USED_BY_MODULE_SCHEMA,
    ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_PRIMARY_OF_MODULE,
  ]),
  ENTITY: Object.freeze([
    ADMIN_DEPENDENCY_KINDS.ENTITY_REFERENCED_BY_RECORDS,
    ADMIN_DEPENDENCY_KINDS.ENTITY_IN_RELATIONSHIPS,
  ]),
  MODULE: Object.freeze([
    ADMIN_DEPENDENCY_KINDS.MODULE_HAS_RECORDS,
    ADMIN_DEPENDENCY_KINDS.MODULE_HAS_VERSIONS,
    ADMIN_DEPENDENCY_KINDS.MODULE_USED_BY_LEDGER_BOOK,
    ADMIN_DEPENDENCY_KINDS.MODULE_IN_WORKSET,
    ADMIN_DEPENDENCY_KINDS.MODULE_IN_WIDGET,
    ADMIN_DEPENDENCY_KINDS.MODULE_IN_REPORT,
  ]),
  MODULE_CATEGORY: Object.freeze([
    ADMIN_DEPENDENCY_KINDS.CATEGORY_USED_BY_MODULES,
  ]),
});

/**
 * Human-readable descriptions — UI renders these when blocking a deletion.
 */
export const ADMIN_DEPENDENCY_LABELS = Object.freeze({
  [ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_HAS_ENTITIES]: 'Entities of this Type exist',
  [ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_USED_BY_MODULE_SCHEMA]: 'Modules reference this Type through form fields',
  [ADMIN_DEPENDENCY_KINDS.ENTITY_TYPE_PRIMARY_OF_MODULE]: 'Modules declare this as their primary Entity Type',
  [ADMIN_DEPENDENCY_KINDS.ENTITY_REFERENCED_BY_RECORDS]: 'Records reference this Entity',
  [ADMIN_DEPENDENCY_KINDS.ENTITY_IN_RELATIONSHIPS]: 'Canonical relationships reference this Entity',
  [ADMIN_DEPENDENCY_KINDS.MODULE_HAS_RECORDS]: 'Records were created from this Module',
  [ADMIN_DEPENDENCY_KINDS.MODULE_HAS_VERSIONS]: 'Published Module Version snapshots exist',
  [ADMIN_DEPENDENCY_KINDS.MODULE_USED_BY_LEDGER_BOOK]: 'A Ledger Book is configured for this Module',
  [ADMIN_DEPENDENCY_KINDS.MODULE_IN_WORKSET]: 'A Workset includes this Module',
  [ADMIN_DEPENDENCY_KINDS.MODULE_IN_WIDGET]: 'A Widget is configured for this Module',
  [ADMIN_DEPENDENCY_KINDS.MODULE_IN_REPORT]: 'A Report includes this Module as a data source',
  [ADMIN_DEPENDENCY_KINDS.CATEGORY_USED_BY_MODULES]: 'Modules are still assigned to this Category',
});

/**
 * A resource may ONLY be hard-deleted if every registered dependency kind
 * reports zero current references. Audit entries are NEVER a blocker (the
 * admin action itself is audited after deletion — see ADR-0013).
 */
export function explainDependencies(kindCounts) {
  return Object.entries(kindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => ({ kind, label: ADMIN_DEPENDENCY_LABELS[kind] || kind, count }));
}
