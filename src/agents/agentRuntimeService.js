/* Modulity 2.0 — Agent Runtime & Live Provider Orchestration (Step 27)
 *
 * Deterministic run loop: build authorized Context → call provider() → final
 * answer + tools / results → append metrics → producer mitigates everything.
 */

import {
  AGENT_RUNTIME_ERROR_CODES,
  AGENT_RUNTIME_LIMITS,
  AGENT_RUN_STATUSES,
  createAgentRun,
  createStepTrace,
} from './runtime/agentRuntime.js';
import { KNOWN_TOOL_IDS, validateToolArguments, evaluateTool } from './tools/agentToolRegistry.js';
import { evaluate as evaluateRuleDefinition } from '../core/rules/ruleDefinition.js';

const MAX_STEPS = AGENT_RUNTIME_LIMITS.MAX_AGENT_STEPS;
const MAX_TOOL_PER_STEP = AGENT_RUNTIME_LIMITS.MAX_TOOL_CALLS_PER_STEP;
const MAX_TOOL_PER_RUN = AGENT_RUNTIME_LIMITS.MAX_TOOL_CALLS_PER_RUN;
const MAX_TRACE_ENTRIES = AGENT_RUNTIME_LIMITS.MAX_TRACE_ENTRIES;

/** Agent Run loop orchestrates bounded provider calls, tool execution, state transitions. */
export class AgentRuntime {
  constructor({ capabilityRegistry = null, providerRegistry = new Map(), simulation = null } = {}) {
    this.capabilityRegistry = capabilityRegistry;
    this.providerRegistry = providerRegistry;
    this.simulation = simulation;
  }

  registerProvider(adapter) { this.providerRegistry.set(adapter.providerKey, adapter); }

  async run(rows, { abortSignal = null } = {}) {
    const def = rows.agentDefinition;
    if (!def) throw new Error('agentDefinition is required');
    const run = createAgentRun({
      runId: rows.runId,
      workspaceId: rows.workspaceId,
      agentId: def.agentId,
      agentVersion: def.version,
      mode: def.mode,
      task: rows.task,
      byActor: rows.byActor || null,
      context: rows.context || {},
      providerMetadata: {},
    });
    return this._runLoop(rows, run, def, abortSignal);
  }

  async _runLoop(rows, run, def, abortSignal) {
    const trace = [];
    let steps = 0;
    let runStatus = AGENT_RUN_STATUSES.PREPARING_CONTEXT;
    const history = [];
    while (steps < MAX_STEPS) {
      steps += 1;
      runStatus = AGENT_RUN_STATUSES.CALLING_PROVIDER;
      trace.push({ kind: 'STEP', num: steps, at: new Date().toISOString() });
      if (abortSignal?.aborted) { runStatus = AGENT_RUN_STATUSES.CANCELLED; break; }
      const provider = this.providerRegistry.get(def.provider);
      if (!provider) { runStatus = AGENT_RUN_STATUSES.FAILED; throw new Error(AGENT_RUNTIME_ERROR_CODES.UNKNOWN_PROVIDER); }
      const answer = await provider.generate({ task: run.task, context: run.context, toolDescriptions: [...KNOWN_TOOL_IDS].map((id) => this._toolDescription(id)), history });
      const Intents = Array.isArray(answer.intents) ? answer.intents : [];
      if (Intents.length === 0) {
        history.push({ content: answer, author: 'provider' });
        runStatus = AGENT_RUN_STATUSES.COMPLETED;
        trace.push({ kind: 'COMPLETE', at: new Date().toISOString() });
        break;
      }
      if (Intents.length > MAX_TOOL_PER_STEP) throw new Error(AGENT_RUNTIME_ERROR_CODES.AGENT_TOOL_LIMIT_EXCEEDED);
      for (const intent of Intents) {
        if (this._countToolCalls(history) >= MAX_TOOL_PER_RUN) { runStatus = AGENT_RUN_STATUSES.FAILED; throw new Error(AGENT_RUNTIME_ERROR_CODES.AGENT_TOOL_LIMIT_EXCEEDED); }
        trace.push({ kind: 'TOOL_CALL', toolId: intent.toolId, at: new Date().toISOString() });
        const toolResult = await this._executeTool(intent.toolId, intent.args, { run, agentDefinition: def });
        trace.push({ kind: 'TOOL_RESULT', toolId: intent.toolId, bytes: JSON.stringify(toolResult).length, at: new Date().toISOString() });
        history.push({ content: toolResult, author: 'tool' });
      }
      if (trace.length >= MAX_TRACE_ENTRIES) trace.splice(0, trace.length - MAX_TRACE_ENTRIES);
    }
    if (runStatus !== AGENT_RUN_STATUSES.COMPLETED && runStatus !== AGENT_RUN_STATUSES.CANCELLED && runStatus !== AGENT_RUN_STATUSES.FAILED) runStatus = steps >= MAX_STEPS ? AGENT_RUN_STATUSES.FAILED : runStatus;
    return Object.freeze({ ...run, status: runStatus, totalSteps: steps, trace: createStepTrace(trace) });
  }

  _toolDescription(toolId) {
    switch (toolId) {
      case 'EVALUATE_RULE': return { toolId, summary: 'Evaluates a RuleDefinition against an incoming BusinessEvent; never mutates production state.' };
      case 'AGENT_SIMULATE': return { toolId, summary: 'Runs the deterministic simulator on a BusinessEvent chain.' };
      case 'EVALUATE_CAPABILITY': return { toolId, summary: 'Identifies registered platform capabilities by ID.' };
      default: throw new Error(AGENT_RUNTIME_ERROR_CODES.UNKNOWN_TOOL);
    }
  }

  _countToolCalls(history) { return history.filter((entry) => entry.author === 'tool').length; }

  async _executeTool(toolId, args, ctx) {
    if (!KNOWN_TOOL_IDS.has(toolId)) throw new Error(AGENT_RUNTIME_ERROR_CODES.UNKNOWN_TOOL);
    validateToolArguments({ toolId }, args);
    if (toolId === 'AGENT_SIMULATE') {
      const simulationModule = await import('../core/simulation/simulationEngine.js');
      return simulationModule.simulateScenario({
        runId: ctx.run.runId,
        workspaceId: ctx.run.workspaceId,
        inputEvent: args.event,
        state: args.state || {},
        context: args.context || {},
        steps: args.steps || [],
        authority: args.authority || [],
      });
    }
    try {
      return evaluateTool({ toolId }, args);
    } catch (error) {
      const classified = error.message.includes('RULE') ? 'RULE_FAILED' : 'TOOL_FAILED';
      return { toolId, status: classified, error: error.message };
    }
    void evaluateRuleDefinition;
  }
}
