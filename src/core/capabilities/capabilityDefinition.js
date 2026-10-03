/**
 * Modulity 2.0 — CapabilityDefinition domain model
 *
 * Generic persisted configuration for a Capability Engine.
 * Contains identity, workspace, engine contract, typed source reference,
 * declarative configuration, lifecycle status, and provenance.
 *
 * Does NOT store projected business data.
 */

import { CAPABILITY_CONTRACT_VERSION, CAPABILITY_DEFINITION_STATUSES, createCapabilityDefinition } from './capabilityContracts.js';

/**
 * @typedef {Object} CapabilityDefinition
 * @property {string} definitionId
 * @property {string} definitionVersion — semantic version of the definition schema
 * @property {string} workspaceId
 * @property {string} engineId
 * @property {string} contractVersion — capability engine contract version
 * @property {string} name — human-readable name
 * @property {string} description
 * @property {Object} source — typed canonical source reference
 * @property {Object} configuration — engine-specific declarative config
 * @property {string} status — DRAFT | ACTIVE | INACTIVE | ARCHIVED
 * @property {Object} createdBy — ActorRef
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export function createCapabilityDefinitionDocument({
  definitionId,
  workspaceId,
  engineId,
  name,
  description = '',
  source,
  configuration = {},
  status = CAPABILITY_DEFINITION_STATUSES.DRAFT,
  createdBy,
  createdAt,
  updatedAt,
}) {
  if (!definitionId) throw new Error('definitionId is required');
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!engineId) throw new Error('engineId is required');
  if (!name) throw new Error('name is required');
  if (!createdBy) throw new Error('createdBy is required');

  const doc = createCapabilityDefinition({
    definitionId,
    definitionVersion: '1.0.0',
    engineId,
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    workspaceId,
    source,
    configuration,
    status,
  });

  return Object.freeze({
    ...doc,
    name: String(name).trim(),
    description: String(description).trim(),
    createdBy: Object.freeze({ ...createdBy }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  });
}

export function normalizeCapabilityDefinitionUpdates(definition, changes) {
  const safe = { ...changes };
  delete safe.definitionId;
  delete safe.workspaceId;
  delete safe.engineId;
  delete safe.contractVersion;
  delete safe.definitionVersion;
  delete safe.createdBy;
  delete safe.createdAt;
  delete safe.updatedAt;
  return safe;
}
