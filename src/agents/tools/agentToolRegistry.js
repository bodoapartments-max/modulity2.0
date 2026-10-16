/**
 * Canonical Agent Tool Registry (Step 27).
 *
 * Deterministic adapter between a model that wishes to call a tool and the real
 * platform engine that knows how to answer it. There is ONLY ONE TOOL REGISTRY —
 * no shadow set exists and model-specified tools must come through this gate.
 */
import { evaluate as evaluateRuleDefinition } from '../../core/rules/ruleDefinition.js';

export const AGENT_TOOL_SCHEMA_VERSION = '1.0.0';

export const AGENT_TOOL_CLASSES = Object.freeze({ READ: 'READ', EVALUATE: 'EVALUATE', SIMULATE: 'SIMULATE', PROPOSE: 'PROPOSE', REQUEST_ACTION: 'REQUEST_ACTION' });

export const AGENT_TOOL_ERROR_CODES = Object.freeze({
  UNKNOWN_AGENT_TOOL: 'UNKNOWN_AGENT_TOOL',
  INVALID_TOOL_ARGUMENTS: 'INVALID_TOOL_ARGUMENTS',
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
  CONTEXT_ACCESS_DENIED: 'CONTEXT_ACCESS_DENIED',
});

/** One closed set, intentionally tiny while business capability grows. */
export const KNOWN_TOOL_IDS = Object.freeze(new Set([
  'AGENT_SIMULATE',
  'EVALUATE_RULE',
  'EVALUATE_CAPABILITY',
]));

/**
 * Validates one sealed tool descriptor. Missing entry ⇒ rejected, not created.
 */
export function createAgentTool({ toolId, class: toolClass, description, inputSchema = {}, risk = 'LOW' }) {
  if (!KNOWN_TOOL_IDS.has(toolId)) throw new Error(AGENT_TOOL_ERROR_CODES.UNKNOWN_AGENT_TOOL);
	if (!AGENT_TOOL_CLASSES[toolClass]) throw new Error('invalid tool class');
	return Object.freeze({
		toolId, schemaVersion: AGENT_TOOL_SCHEMA_VERSION, class: toolClass, description, inputSchema: Object.freeze(inputSchema), risk,
	});
}

/** Validates model always-specific args against a sealed schema. */
export function validateToolArguments(tool, providedArgs) {
	if (!tool) throw new Error(AGENT_TOOL_ERROR_CODES.UNKNOWN_AGENT_TOOL);
	if (!providedArgs || typeof providedArgs !== 'object' || Array.isArray(providedArgs)) throw new Error(AGENT_TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS);
	const required = tool.inputSchema?.required || [];
	for (const field of required) {
		if (!(field in providedArgs)) throw new Error(AGENT_TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS);
	}
	return true;
}

/**
 * Returns a deterministic envelope of the ready evaluators and their contexts.
 */
export function evaluateTool(tool, args) {
  switch (tool.toolId) {
    case 'EVALUATE_RULE':
      if (!args?.rule) throw new Error(AGENT_TOOL_ERROR_CODES.INVALID_TOOL_ARGUMENTS);
      return { classCode: tool.class, result: evaluateRuleDefinition(args.rule, args.input) };
    default:
      throw new Error(AGENT_TOOL_ERROR_CODES.UNKNOWN_AGENT_TOOL);
  }
}

export function toolUsageEntries(runId, kind = 'TOOL_CALL') { return Object.freeze([{ runId, kind, at: new Date().toISOString() }]); }
