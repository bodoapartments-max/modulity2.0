export const RESET_MODES = Object.freeze({ WORKSPACE_DATA_RESET: 'WORKSPACE_DATA_RESET', MODULE_DATA_RESET: 'MODULE_DATA_RESET', FULL_WORKSPACE_DELETE: 'FULL_WORKSPACE_DELETE' });

export const WORKSPACE_RESET_RESOURCES = Object.freeze([
  { resource: 'records', collection: 'records', strategy: 'RECURSIVE_DELETE' },
  // Trusted Record/Ledger operation journals — test operations must not
  // ghost across a Workspace Reset. Top-level surviving operation-proof
  // documents live OUTSIDE the workspace (workspaceResetAudits) and stay.
  { resource: 'recordOperations', collection: 'recordOperations', strategy: 'RECURSIVE_DELETE' },
  { resource: 'domainEntityTypes', collection: 'entityTypes', strategy: 'DOMAIN_ONLY' },
  { resource: 'entities', collection: 'entities', strategy: 'RECURSIVE_DELETE' },
  { resource: 'relationships', collection: 'relationships', strategy: 'RECURSIVE_DELETE' },
  { resource: 'fileMetadata', collection: 'files', strategy: 'RECURSIVE_DELETE' },
  { resource: 'modules', collection: 'modules', strategy: 'RECURSIVE_DELETE' },
  { resource: 'moduleCodes', collection: 'moduleCodes', strategy: 'RECURSIVE_DELETE' },
  { resource: 'deliveries', collection: 'deliveries', strategy: 'RECURSIVE_DELETE' },
  { resource: 'formRequests', collection: 'formRequests', strategy: 'RECURSIVE_DELETE' },
  { resource: 'folders', collection: 'folders', strategy: 'RECURSIVE_DELETE' },
  { resource: 'userRecordState', collection: 'userRecordState', strategy: 'RECURSIVE_DELETE' },
  { resource: 'shareTokens', collection: 'shareTokens', strategy: 'RECURSIVE_DELETE' },
  { resource: 'worksets', collection: 'worksets', strategy: 'RECURSIVE_DELETE' },
  { resource: 'widgetDefinitions', collection: 'widgetDefinitions', strategy: 'RECURSIVE_DELETE' },
  { resource: 'reportDefinitions', collection: 'reportDefinitions', strategy: 'RECURSIVE_DELETE' },
  { resource: 'notifications', collection: 'notifications', strategy: 'RECURSIVE_DELETE' },
  { resource: 'workspacePreferences', collection: 'userWorkspacePreferences', strategy: 'RECURSIVE_DELETE' },
  { resource: 'conversations', collection: 'conversations', strategy: 'RECURSIVE_DELETE' },
  { resource: 'ledgerBooks', collection: 'ledgerBooks', strategy: 'RECURSIVE_DELETE' },
  { resource: 'ledgerEntries', collection: 'ledgerEntries', strategy: 'RECURSIVE_DELETE' },
  { resource: 'ledgerCodes', collection: 'ledgerCodes', strategy: 'RECURSIVE_DELETE' },
  { resource: 'auditEntries', collection: 'auditEntries', strategy: 'RECURSIVE_DELETE' },
  { resource: 'automatPlans', collection: 'automatPlans', strategy: 'RECURSIVE_DELETE' },
  { resource: 'capabilityDefinitions', collection: 'capabilityDefinitions', strategy: 'RECURSIVE_DELETE' },
]);

export const PRESERVED_RESOURCES = Object.freeze(['authenticatedUser', 'userProfile', 'workspaceDocument', 'workspaceIdentity', 'organizationDocument', 'memberships', 'ownerAccess', 'coreEntityTypes']);
