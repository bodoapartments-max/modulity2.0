import { AGENT_PROVIDER_TYPES } from '../contracts/agentContracts.js';
import { AgentProviderAdapter } from './agentProviderAdapter.js';

export class DeterministicTestAdapter extends AgentProviderAdapter {
  constructor(outputs = {}) {
    super(AGENT_PROVIDER_TYPES.DETERMINISTIC_TEST);
    this.outputs = new Map(Object.entries(outputs));
  }

  set(agentCode, outputOrHandler) {
    this.outputs.set(agentCode, outputOrHandler);
  }

  async execute(definition, request) {
    if (!this.outputs.has(definition.agentCode)) throw new Error(`No deterministic output for ${definition.agentCode}`);
    const configured = this.outputs.get(definition.agentCode);
    const output = typeof configured === 'function' ? await configured(definition, request) : configured;
    return structuredClone(output);
  }
}
