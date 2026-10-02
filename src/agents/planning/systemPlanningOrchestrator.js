import { AgentOrchestrator } from '../orchestrator/agentOrchestrator.js';
import { AgentRegistry } from '../registry/agentRegistry.js';
import { createAutomatBuildPlan } from '../automat/automatContracts.js';
import { validateAutomatBuildPlan } from '../automat/buildPlanValidator.js';
import { createDeterministicPlanningAdapter } from './deterministicPlanningAdapter.js';
import { PLANNING_AGENT_CODES, createPlanningAgentDefinitions, planningInputValidators, planningOutputValidators } from './planningContracts.js';

const STAGES = Object.freeze([PLANNING_AGENT_CODES.ORGANIZATION_ANALYZER, PLANNING_AGENT_CODES.DOMAIN_MODEL_PLANNER, PLANNING_AGENT_CODES.PROCESS_PLANNER, PLANNING_AGENT_CODES.MODULE_PLANNER, PLANNING_AGENT_CODES.WORKSPACE_EXPERIENCE_PLANNER, PLANNING_AGENT_CODES.SYSTEM_REVIEWER]);
const stageRequest = (requestId, workspaceId, requestedBy, agentCode, input) => ({ requestId: `${requestId}:${agentCode}`, workspaceId, agentCode, agentVersion: '1.0.0', inputSchemaVersion: '1.0.0', outputSchemaVersion: '1.0.0', requestedBy, input, context: { planningOnly: true } });

export function createSystemPlanningOrchestrator({ canUse = async () => true, adapter = createDeterministicPlanningAdapter(), clock, timeoutMs = 5_000 } = {}) {
  const registry = new AgentRegistry({ canUse });
  createPlanningAgentDefinitions().forEach((definition) => registry.register({ ...definition, timeoutPolicy: { timeoutMs } }));
  const agentOrchestrator = new AgentOrchestrator({ registry, adapters: { DETERMINISTIC_TEST: adapter }, inputValidators: planningInputValidators, outputValidators: planningOutputValidators, ...(clock ? { clock } : {}) });

  const executeStage = async (agentCode, requestId, workspaceId, requestedBy, input, onStage) => {
    onStage?.(agentCode);
    const result = await agentOrchestrator.execute(stageRequest(requestId, workspaceId, requestedBy, agentCode, input), { workspaceId, requestedBy });
    if (result.status !== 'SUCCEEDED') throw Object.assign(new Error(`${agentCode} failed: ${result.errors.map((item) => item.message).join(', ')}`), { code: 'PLANNING_STAGE_FAILED', stage: agentCode, result });
    return result;
  };

  return {
    agentCodes: STAGES,
    async plan({ requestId, workspaceId, requestedBy, organizationInput, snapshot, onStage }) {
      if (!requestId || !workspaceId || !requestedBy) throw new Error('Planning request identity is required');
      if (organizationInput.workspaceId !== workspaceId || snapshot.workspaceId !== workspaceId) throw new Error('Planning Workspace mismatch');
      const executions = [];
      const run = async (code, input) => { const result = await executeStage(code, requestId, workspaceId, requestedBy, input, onStage); executions.push(result); return result.output; };
      const analysis = await run(PLANNING_AGENT_CODES.ORGANIZATION_ANALYZER, organizationInput);
      const domainModel = await run(PLANNING_AGENT_CODES.DOMAIN_MODEL_PLANNER, { schemaVersion: '1.0.0', analysis });
      const processPlan = await run(PLANNING_AGENT_CODES.PROCESS_PLANNER, { schemaVersion: '1.0.0', analysis, domainModel });
      const modulePlan = await run(PLANNING_AGENT_CODES.MODULE_PLANNER, { schemaVersion: '1.0.0', analysis, domainModel, processPlan });
      const experiencePlan = await run(PLANNING_AGENT_CODES.WORKSPACE_EXPERIENCE_PLANNER, { schemaVersion: '1.0.0', analysis, domainModel, processPlan, modulePlan });
      const review = await run(PLANNING_AGENT_CODES.SYSTEM_REVIEWER, { schemaVersion: '1.0.0', analysis, domainModel, processPlan, modulePlan, experiencePlan });
      const provenance = executions.map((result) => ({ agentCode: result.agentCode, agentVersion: result.agentVersion, requestId: result.requestId, providerAdapter: result.provenance.providerAdapter }));
      const draft = createAutomatBuildPlan({ planId: `plan:${requestId}`, planVersion: '1.0.0', status: 'READY_FOR_REVIEW', workspaceId, source: { requestedBy, requestId, agentExecutions: executions.map((item) => item.requestId) }, organizationProfile: { ...analysis.organizationProfile, assumptions: review.assumptions }, industryAnalysis: analysis.industryAnalysis, businessAreas: analysis.businessAreas, domainObjects: domainModel.domainObjects, processes: processPlan.processes, capabilities: processPlan.capabilities, proposedEntityTypes: domainModel.proposedEntityTypes, proposedModules: modulePlan.proposedModules, proposedRelationships: domainModel.proposedRelationships, proposedWorksets: experiencePlan.proposedWorksets, proposedWidgets: experiencePlan.proposedWidgets, proposedReports: experiencePlan.proposedReports, warnings: [...analysis.warnings, ...review.warnings], unresolvedQuestions: review.unresolvedQuestions, validation: null, provenance: { contractVersion: '1.0.0', generatedBy: provenance } });
      onStage?.('VALIDATING');
      const validation = validateAutomatBuildPlan(draft, snapshot);
      const plan = createAutomatBuildPlan({ ...draft, status: validation.status === 'INVALID' ? 'INVALID' : 'READY_FOR_REVIEW', validation });
      return Object.freeze({ plan, validation, review: Object.freeze(review), executions: Object.freeze(executions) });
    },
  };
}
