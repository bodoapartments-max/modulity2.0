import { DeterministicTestAdapter } from '../providers/deterministicTestAdapter.js';
import { INDUSTRY_KNOWLEDGE, PLATFORM_CAPABILITIES, resolveIndustryKnowledge } from './industryKnowledge.js';

const clone = (value) => structuredClone(value);
const knowledgeFromAnalysis = (analysis) => {
  const knowledge = INDUSTRY_KNOWLEDGE.find((item) => item.code === analysis.industryAnalysis?.knowledgeCode);
  if (!knowledge) throw new Error('Structured industry knowledge profile is unavailable');
  return knowledge;
};
const extractCount = (text, noun) => Number(text?.match(new RegExp(`(\\d+)\\s*[- ]?${noun}`, 'i'))?.[1]) || null;

export function createDeterministicPlanningAdapter() {
  return new DeterministicTestAdapter({
    ORGANIZATION_ANALYZER: (_definition, request) => {
      const knowledge = resolveIndustryKnowledge(request.input);
      const description = request.input.userDescription || request.input.description || '';
      const employeeCount = request.input.employeeCount ?? extractCount(description, 'employees?') ?? extractCount(description, 'teachers?');
      const facilityCount = extractCount(description, 'rooms?') ?? extractCount(description, 'classrooms?');
      return {
        schemaVersion: '1.0.0',
        organizationProfile: { organizationType: knowledge.organizationType, industry: knowledge.industry, subIndustry: knowledge.code, operatingModel: 'Operational service organization', country: request.input.country || null, size: request.input.size || null, employeeCount, locations: clone(request.input.locations || []), facilities: clone(request.input.facilities || []), assets: clone(request.input.assets || []), services: clone(request.input.services || []), customerTypes: [], supplierTypes: [], operationalCharacteristics: facilityCount ? [`Approximately ${facilityCount} relevant facilities/assets`] : [], regulatoryCharacteristics: [], terminology: clone(knowledge.terminology), assumptions: clone(knowledge.assumptions), missingInformation: [], warnings: [] },
        industryAnalysis: { knowledgeCode: knowledge.code, industry: knowledge.industry, organizationType: knowledge.organizationType, rationale: `Matched structured operating-domain knowledge using organization terminology.` },
        businessAreas: clone(knowledge.businessAreas), domainObjects: [], processes: [], capabilities: [], missingInformation: [], warnings: [], confidence: undefined,
      };
    },
    DOMAIN_MODEL_PLANNER: (_definition, request) => {
      const knowledge = knowledgeFromAnalysis(request.input.analysis);
      return { schemaVersion: '1.0.0', domainObjects: clone(knowledge.domainObjects), proposedEntityTypes: clone(knowledge.entityTypes), proposedRelationships: clone(knowledge.relationships) };
    },
    PROCESS_PLANNER: (_definition, request) => {
      const knowledge = knowledgeFromAnalysis(request.input.analysis);
      return { schemaVersion: '1.0.0', processes: clone(knowledge.processes), capabilities: clone(PLATFORM_CAPABILITIES) };
    },
    MODULE_PLANNER: (_definition, request) => {
      const knowledge = knowledgeFromAnalysis(request.input.analysis);
      return { schemaVersion: '1.0.0', proposedModules: clone(knowledge.modules) };
    },
    WORKSPACE_EXPERIENCE_PLANNER: (_definition, request) => {
      const knowledge = knowledgeFromAnalysis(request.input.analysis);
      return { schemaVersion: '1.0.0', proposedWorksets: clone(knowledge.worksets), proposedWidgets: clone(knowledge.widgets), proposedReports: clone(knowledge.reports) };
    },
    SYSTEM_REVIEWER: (_definition, request) => {
      const knowledge = knowledgeFromAnalysis(request.input.analysis);
      const modules = request.input.modulePlan.proposedModules;
      const genericCodes = new Set(['EMPLOYEE_ONBOARDING', 'EXPENSE', 'DOCUMENTS', 'TASKS', 'MEETING_NOTES']);
      const genericModuleRatio = modules.length ? modules.filter((item) => genericCodes.has(item.moduleCode)).length / modules.length : 1;
      const warnings = [];
      if (genericModuleRatio > 0.4) warnings.push({ code: 'GENERIC_OVER_SPECIALIZATION', message: 'Generic administration dominates the proposed operational system.' });
      if (request.input.analysis.businessAreas.length < 3) warnings.push({ code: 'INSUFFICIENT_BUSINESS_COVERAGE', message: 'Too few business areas were identified.' });
      return { schemaVersion: '1.0.0', warnings, unresolvedQuestions: clone(knowledge.questions), assumptions: clone(knowledge.assumptions), diagnostics: { businessAreasCovered: request.input.analysis.businessAreas.length, processesCovered: request.input.processPlan.processes.length, domainObjectsCovered: request.input.domainModel.domainObjects.length, unsupportedCapabilities: request.input.processPlan.capabilities.filter((item) => !item.supported).map((item) => item.code), warningsCount: warnings.length, conflictsCount: 0, genericModuleRatio, orphanReferences: 0 } };
    },
  });
}
