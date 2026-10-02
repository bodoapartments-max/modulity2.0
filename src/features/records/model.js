export function getRecordBackNavigation(fromModuleId, moduleDefinition) {
  if (moduleDefinition && fromModuleId === moduleDefinition.moduleId) return { to: `/app/modules/${moduleDefinition.moduleId}/records`, label: `Back to ${moduleDefinition.name} Records` };
  return { to: '/app/records', label: 'Back to Records' };
}
