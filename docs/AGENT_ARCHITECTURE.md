# Modulity 2.0 — Agent Architecture

This document defines how intelligent agents fit into Modulity without becoming part of the Core business logic.

---

## 1. Core Rule

**Agents are optional.** The platform must work when every agent is disabled.

Agents provide:

- Recommendations
- Configuration assistance
- Analysis
- Assistance with content

Agents must never:

- Become the Core business logic
- Bypass authentication or authorization
- Bypass permissions or entitlements
- Bypass schema validation
- Bypass record validation
- Bypass ledger/audit rules
- Directly manipulate trusted database state

---

## 2. No Monolithic AI Agent

Do not create one giant "Modulity AI". Instead, design:

- An **Agent Registry**
- Multiple **specialist agents**
- An **Orchestrator** for agent collaboration

### Example Specialist Agents (future)

| Agent                      | Responsibility                                 |
| -------------------------- | ---------------------------------------------- |
| Company Analysis Agent     | Summarize organization context                 |
| Industry Analysis Agent    | Suggest domain entities for an industry        |
| Module Planning Agent      | Recommend modules for a use case               |
| Module Design Agent        | Propose module manifest and form schema        |
| Form Import Agent          | Extract a form definition from a document      |
| Document Extraction Agent  | Extract data from uploaded files               |
| Wiring Agent               | Suggest relationships between modules/entities |
| Widget Configuration Agent | Propose widget configurations                  |
| Report Agent               | Propose report definitions                     |
| Automation Agent           | Suggest future automation rules                |

---

## 3. Agent Contract

Every agent must declare:

```json
{
  "agentId": "agent:module-designer",
  "version": "1.0.0",
  "name": "Module Design Agent",
  "description": "Suggests module manifests and form schemas.",
  "capabilities": ["module-design", "schema-proposal"],
  "inputContract": {
    "schemaVersion": "1.0.0",
    "fields": [
      { "name": "organizationContext", "type": "object", "required": true },
      { "name": "userIntent", "type": "string", "required": true },
      { "name": "existingModules", "type": "array", "required": false }
    ]
  },
  "outputContract": {
    "schemaVersion": "1.0.0",
    "fields": [
      { "name": "proposedManifest", "type": "module-manifest", "required": false },
      { "name": "proposedFormSchema", "type": "form-schema", "required": false },
      { "name": "confidence", "type": "number", "required": true },
      { "name": "explanation", "type": "string", "required": true }
    ]
  },
  "providerAdapter": "openai-gpt-4o",
  "timeoutMs": 30000,
  "maxRetries": 2,
  "errorBehavior": "return-empty-result",
  "requiredEntitlements": ["agent:module-designer"]
}
```

### Contract Fields

- `agentId` — stable identifier
- `version` — semver
- `capabilities` — what the agent can do
- `inputContract` — expected input schema and version
- `outputContract` — expected output schema and version
- `providerAdapter` — which provider adapter to use
- `timeoutMs` — maximum wait time
- `maxRetries` — retry policy
- `errorBehavior` — how failures are surfaced
- `requiredEntitlements` — capabilities the organization must have

---

## 4. Provider Adapters

A provider adapter translates the agent contract into a specific LLM/provider call.

```ts
interface AgentProvider {
  name: string;
  execute(input: AgentInput, contract: AgentContract): Promise<AgentOutput>;
}
```

Examples:

- `openai-gpt-4o`
- `anthropic-claude`
- `google-gemini`
- `local-ollama`

Changing the model or provider behind an agent must not require rewriting Core.

---

## 5. Agent Registry

The registry:

- Stores available agent contracts
- Validates that an organization has the required entitlements
- Resolves the provider adapter
- Tracks agent versions

Agents are registered explicitly. No agent runs unless registered and entitled.

---

## 6. Orchestrator

The Orchestrator coordinates specialist agents. It:

- Receives a high-level request
- Decides which agents to invoke
- Passes context between agents
- Validates intermediate outputs against output contracts
- Returns a final structured result to the caller

The Orchestrator itself does not manipulate database state. It returns recommendations and configurations that the user or Core services apply through normal validated channels.

---

## 7. External Agents

External agents (software agents operated by customers or partners) must:

- Authenticate via API tokens / service identities
- Use the public API surface
- Respect scoped permissions and rate limits
- Include idempotency keys for important writes
- Be attributable in the audit log

They may not directly access the trusted database.

---

## 8. Validation & Safety

All agent outputs that affect configuration or records must be validated by Core services using the same schemas as manual input:

- Module manifest validation
- Form schema validation
- Record data validation
- Permission checks
- Entitlement checks

If validation fails, the result is rejected or returned for user review. Never persist invalid agent output.

---

## 9. Future Extensions

- Multi-agent workflows
- Human-in-the-loop approvals
- Agent confidence thresholds
- Output versioning and diffing
- Agent audit trail
