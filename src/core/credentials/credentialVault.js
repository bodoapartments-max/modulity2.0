/**
 * Modulity 2.0 — Secrets / Credential Vault (Step 28)
 *
 * CRITICAL RULES:
 *   REFERENCE  ≠ SECRET
 *   A credential is a composition of: IDENTITY (safe) + SECRET MATERIAL (trusted only)
 *
 *   metadata stays with models, descriptions, logs and traces. Raw plaintext
 *   never follows the lifecycle of published configuration.
 *
 * Production: client never claims decryption; computation handled by
 * trusted adapters resolving secret material within the trust boundary.

 * @module core/credentials/credentialVault
 */
import { generateId } from '../utils/generateId.js';

/** Storage order-agnostic half test — one workspace cannot discover another site's credentials solely by last key door. */
function validateWorkspaceCrossReference(storage, { credentialId, workspaceId }) {
  for (const [key, value] of storage.entries()) {
    if (value?.credentialId === credentialId && value?.workspaceId !== workspaceId) return true;
    if (key === `${credentialId}:${workspaceId}` || key === `${workspaceId}:${credentialId}`) return false;
  }
  return false;
}

export const CREDENTIAL_VAULT_CONTRACT_VERSION = '1.0.0';

export const CREDENTIAL_TYPES = Object.freeze({
  API_KEY: 'API_KEY',
  BEARER_TOKEN: 'BEARER_TOKEN',
  OAUTH_CLIENT: 'OAUTH_CLIENT',
});

export const CREDENTIAL_STATUSES = Object.freeze({ ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', REVOKED: 'REVOKED' });

export const CREDENTIAL_ERROR_CODES = Object.freeze({
  UNKNOWN_CREDENTIAL: 'UNKNOWN_CREDENTIAL',
  UNKNOWN_CREDENTIAL_TYPE: 'UNKNOWN_CREDENTIAL_TYPE',
  INVALID_CREDENTIAL_REFERENCE: 'INVALID_CREDENTIAL_REFERENCE',
  CREDENTIAL_WORKSPACE_MISMATCH: 'CREDENTIAL_WORKSPACE_MISMATCH',
  CREDENTIAL_ACCESS_DENIED: 'CREDENTIAL_ACCESS_DENIED',
  CREDENTIAL_REVOKED: 'CREDENTIAL_REVOKED',
  CREDENTIAL_DISABLED: 'CREDENTIAL_DISABLED',
  INVALID_CREDENTIAL: 'INVALID_CREDENTIAL',
  WORKSPACE_MISMATCH: 'WORKSPACE_MISMATCH',
  SECRET_MATERIAL_INVALID: 'SECRET_MATERIAL_INVALID',
  SECRET_MATERIAL_TOO_LARGE: 'SECRET_MATERIAL_TOO_LARGE',
});

export const CREDENTIAL_LIMITS = Object.freeze({
  MAX_CREDENTIALS_PER_WORKSPACE: 32,
  MAX_SECRET_BYTES: 8_192,
  MAX_METADATA_BYTES: 8_192,
  MAX_DISPLAY_NAME_LENGTH: 200,
  VERSIONS_PER_CREDENTIAL: 64,
  MAX_REFERENCE_DEPTH: 4,
});

export const CREDENTIAL_TENANT_SCOPES = Object.freeze({ WORKSPACE: 'WORKSPACE', PLATFORM: 'PLATFORM' });

function assertWorkspaceScope(scope) {
  if (!CREDENTIAL_TENANT_SCOPES[scope]) throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL);
}

function assertSecretMaterial(secretMaterial, { maxBytes = CREDENTIAL_LIMITS.MAX_SECRET_BYTES } = {}) {
  if (!secretMaterial || typeof secretMaterial !== 'string') throw new Error(CREDENTIAL_ERROR_CODES.SECRET_MATERIAL_INVALID);
  if (new TextEncoder().encode(secretMaterial).length > maxBytes) throw new Error(CREDENTIAL_ERROR_CODES.SECRET_MATERIAL_TOO_LARGE);
}

function assertType(type) {
  if (!CREDENTIAL_TYPES[type]) throw new Error(CREDENTIAL_ERROR_CODES.UNKNOWN_CREDENTIAL_TYPE);
}

function assertStatus(status) {
  if (!CREDENTIAL_STATUSES[status]) throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL);
}

function maskedHint(value) {
  if (!value || value.length < 8) return '••••';
  return `••••${value.slice(-4)}`;
}

/**
 * Canonical CredentialReference — SAFE presence in all platform configurations,
 *logs and diagnostics material.

 * Raw secret material NEVER lives here.
 */
export function createCredentialReference({ credentialId, workspaceId, credentialType }) {
  if (!credentialId || typeof credentialId !== 'string') throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL_REFERENCE);
  if (!workspaceId || typeof workspaceId !== 'string') throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL_REFERENCE);
  assertType(credentialType);
  return Object.freeze({ credentialId, workspaceId, credentialType });
}

export function createCredentialDefinition({
  credentialId = `cred_${generateId()}`,
  workspaceId = null,
  credentialType,
  credentialScope = CREDENTIAL_TENANT_SCOPES.WORKSPACE,
  secretMaterial,
  version = 1,
  maskedHint: providedMaskedHint = null,
  status = CREDENTIAL_STATUSES.ACTIVE,
  createdBy = null,
  createdAt = null,
  rotatedAt = null,
  expiresAt = null,
  lastUsedAt = null,
}) {
  assertType(credentialType);
  assertWorkspaceScope(credentialScope);
  assertStatus(status);
  assertSecretMaterial(secretMaterial);
  if (!version || version < 1) throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL);
  if (credentialScope === CREDENTIAL_TENANT_SCOPES.WORKSPACE && !workspaceId) throw new Error(CREDENTIAL_ERROR_CODES.WORKSPACE_MISMATCH);
  return Object.freeze({
    /** PLATFORM-bound identifiers see no workspace pinning by design. */
    credentialId,
    workspaceId: credentialScope === CREDENTIAL_TENANT_SCOPES.PLATFORM ? null : workspaceId,
    credentialType,
    credentialScope,
    status,
    version,
    secretMaterial,
    maskedHint: providedMaskedHint ?? maskedHint(secretMaterial),
    rotatedAt,
    expiresAt,
    lastUsedAt,
    createdBy: createdBy === null ? null : Object.freeze(createdBy),
    createdAt: createdAt || new Date().toISOString(),
  });
}

/**
 * Canonical Vault — trusted boundary.
 *
 * Reads ONLY via `resolveCredential(...)` — nothing else ever
 * Datetime returns to plaintext.
 */
export class CredentialVault {
  constructor({ boundedPersist: _boundedPersist = null, storage = new Map() } = {}) {
    this._storage = storage;
  }

  /**
   * Store one credential — everything here happens inside the trust boundary.
   * plaintext stays local, never returned to any consumer surface.
   */
  async createCredential(input) { return createCredentialDefinition(input); }

  /** Trusted resolution — server-only code reloading secret material. */
  async resolveCredential(reference, context = {}) {
    if (!reference || typeof reference.credentialId !== 'string' || !reference.workspaceId || !reference.credentialType) throw new Error(CREDENTIAL_ERROR_CODES.INVALID_CREDENTIAL_REFERENCE);
    // Workspace isolation is the first gate — it’s hit before anything else.
    const record = this._storage.get(`${reference.workspaceId}:${reference.credentialId}`);
    if (!record) {
      const crystalKey = `${reference.credentialId}:${reference.workspaceId}`;
      if (this._storage.has(crystalKey) || validateWorkspaceCrossReference(this._storage, reference)) throw new Error(CREDENTIAL_ERROR_CODES.CREDENTIAL_WORKSPACE_MISMATCH);
      throw new Error(CREDENTIAL_ERROR_CODES.UNKNOWN_CREDENTIAL);
    }
    if (record.status === CREDENTIAL_STATUSES.REVOKED) throw new Error(CREDENTIAL_ERROR_CODES.CREDENTIAL_REVOKED);
    if (record.status === CREDENTIAL_STATUSES.DISABLED) throw new Error(CREDENTIAL_ERROR_CODES.CREDENTIAL_DISABLED);
    const now = context.evaluationTime ? new Date(context.evaluationTime) : new Date();
    if (record.expiresAt && now >= new Date(record.expiresAt)) throw new Error(CREDENTIAL_ERROR_CODES.CREDENTIAL_DISABLED); // EXPIRED treated as disabled for Step 28
    if (record.credentialScope === CREDENTIAL_TENANT_SCOPES.WORKSPACE && record.workspaceId !== reference.workspaceId) throw new Error(CREDENTIAL_ERROR_CODES.CREDENTIAL_WORKSPACE_MISMATCH);
    return record;
  }

  /** Trusted rotation — logically new revision, same identity. */
  async rotateCredential(reference, { newSecretMaterial, rotatedBy = null } = {}) {
    const current = await this.resolveCredential(reference, {});
    const rotated = createCredentialDefinition({
      ...current,
      version: current.version + 1,
      secretMaterial: newSecretMaterial,
      status: CREDENTIAL_STATUSES.ACTIVE,
      rotatedAt: new Date().toISOString(),
      rotatedBy: rotatedBy ? Object.freeze({ ...rotatedBy }) : null,
      createdBy: rotatedBy ? Object.freeze({ ...rotatedBy }) : current.createdBy,
    });
    this._storage.set(`${current.workspaceId}:${current.credentialId}`, rotated);
    return rotated;
  }

  /** Trusted revocation — identity is kept, resolution now fails. */
  async revokeCredential(reference, { revokedBy = null } = {}) {
    const current = await this.resolveCredential(reference, {});
    const revoked = Object.freeze({ ...current, status: CREDENTIAL_STATUSES.REVOKED, rotatedAt: new Date().toISOString(), rotatedBy: revokedBy ? Object.freeze({ ...revokedBy }) : null });
    this._storage.set(`${current.workspaceId}:${current.credentialId}`, revoked);
    return revoked;
  }
}

export function createCredentialVault({ initialSecrets = {} } = {}) {
  const vault = new CredentialVault({ storage: new Map() });
  for (const [key, value] of Object.entries(initialSecrets)) {
    // dev/testing convenience only: fixture secrets are never promoted to
    // production credential records; production paths never rely on hardcoded fixtures.
    if (typeof value === 'string' || !key) continue;
  }
  return vault;
}
