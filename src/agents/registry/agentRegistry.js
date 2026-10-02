import { AGENT_STATUSES, createAgentDefinition } from '../contracts/agentContracts.js';

export class AgentRegistry {
  constructor({ canUse = async () => true } = {}) {
    this.definitions = new Map();
    this.canUse = canUse;
  }

  register(value) {
    const definition = createAgentDefinition(value);
    const key = `${definition.agentCode}@${definition.version}`;
    if (this.definitions.has(key)) throw new Error(`Agent already registered: ${key}`);
    this.definitions.set(key, definition);
    return definition;
  }

  get(agentCode, version) {
    return this.definitions.get(`${agentCode}@${version}`) || null;
  }

  async resolve(agentCode, version, entitlementContext = {}) {
    const definition = this.get(agentCode, version);
    if (!definition) throw new Error(`Unknown agent or version: ${agentCode}@${version}`);
    if (definition.status !== AGENT_STATUSES.ACTIVE) throw new Error(`Agent is not active: ${agentCode}@${version}`);
    if (!(await this.canUse(definition.capability, entitlementContext))) throw new Error(`Agent capability is not entitled: ${definition.capability}`);
    return definition;
  }

  list() {
    return [...this.definitions.values()];
  }
}
