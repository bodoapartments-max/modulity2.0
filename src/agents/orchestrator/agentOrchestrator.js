import { AGENT_EXECUTION_STATUSES, assertAgentOutput, createAgentExecutionRequest, createAgentExecutionResult } from '../contracts/agentContracts.js';

export class AgentOrchestrator {
  constructor({ registry, adapters, inputValidators = {}, outputValidators = {}, clock = () => new Date().toISOString() }) {
    if (!registry) throw new Error('Agent Registry is required');
    this.registry = registry;
    this.adapters = new Map(Object.entries(adapters || {}));
    this.inputValidators = inputValidators;
    this.outputValidators = outputValidators;
    this.clock = clock;
  }

  async execute(value, entitlementContext = {}) {
    const request = createAgentExecutionRequest(value);
    const definition = await this.registry.resolve(request.agentCode, request.agentVersion, entitlementContext);
    if (request.inputSchemaVersion !== definition.inputSchemaVersion || request.outputSchemaVersion !== definition.outputSchemaVersion) throw new Error('Agent contract version mismatch');
    const adapter = this.adapters.get(definition.providerAdapter);
    if (!adapter || adapter.providerType !== definition.providerAdapter) throw new Error(`Provider adapter unavailable: ${definition.providerAdapter}`);
    const validateInput = this.inputValidators[`${definition.agentCode}@${definition.inputSchemaVersion}`];
    const validateOutput = this.outputValidators[`${definition.agentCode}@${definition.outputSchemaVersion}`];
    if (!validateInput || !validateOutput) throw new Error(`Contract validator unavailable: ${definition.agentCode}`);
    validateInput(request.input);
    const startedAt = this.clock();
    let timeoutId;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(Object.assign(new Error('Agent execution timed out'), { code: 'AGENT_TIMEOUT' })), definition.timeoutPolicy.timeoutMs);
      });
      const output = assertAgentOutput(await Promise.race([adapter.execute(definition, request), timeout]));
      validateOutput(output);
      return createAgentExecutionResult({ request, definition, status: AGENT_EXECUTION_STATUSES.SUCCEEDED, output, startedAt, completedAt: this.clock() });
    } catch (error) {
      const timedOut = error.code === 'AGENT_TIMEOUT';
      return createAgentExecutionResult({ request, definition, status: timedOut ? AGENT_EXECUTION_STATUSES.TIMED_OUT : AGENT_EXECUTION_STATUSES.FAILED, errors: [{ code: error.code || 'AGENT_EXECUTION_FAILED', message: error.message }], startedAt, completedAt: this.clock() });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
