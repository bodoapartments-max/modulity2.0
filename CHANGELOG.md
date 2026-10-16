# Changelog

All notable changes to Molulity 2.0 will be documented in this file.

## Step 27 — Agent Runtime & Live Provider Orchestration

### Added
- src/agents/runtime/agentRuntime.js — canonical Contract (BUILD / CHANGE / ASSIST)
- src/agents/agentRuntimeService.js — deterministic run-loop; step/tool limits enforce limits
- src/agents/tools/agentToolRegistry.js — every agent tool whitelisted only
- Capability Registry agent-runtime with simulation + policy-authority

### Held
- provider secrets stay server + Step 28 supplies Vault later
