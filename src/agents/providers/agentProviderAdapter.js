export class AgentProviderAdapter {
  constructor(providerType) {
    if (!providerType) throw new Error('providerType is required');
    this.providerType = providerType;
  }

  async execute() {
    throw new Error('AgentProviderAdapter.execute must be implemented');
  }
}
