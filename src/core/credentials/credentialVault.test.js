import { describe, expect, it } from 'vitest';
import {
  createCredentialDefinition,
  createCredentialReference,
  CredentialVault,
  CREDENTIAL_ERROR_CODES,
  CREDENTIAL_STATUSES,
  CREDENTIAL_TYPES,
} from './credentialVault.js';

function person(actorId = 'user-x') { return { actorType: 'USER', actorId }; }

describe('CredentialReference unsurprisingly split identity from secret', () => {
  it('metadata reference carries ID/type/workspace only', () => {
    const cred = createCredentialDefinition({
      credentialId: 'cred-test',
      workspaceId: 'ws-1',
      credentialType: CREDENTIAL_TYPES.API_KEY,
      secretMaterial: 'sk-test-example-12345',
    });
    const ref = createCredentialReference({ credentialId: cred.credentialId, workspaceId: 'ws-1', credentialType: cred.credentialType });
    expect(Object.keys(ref).sort()).toEqual(['credentialId', 'credentialType', 'workspaceId'].sort());
    // Metadata view does NOT include the plaintext:
    const masked = cred.maskedHint;
    expect(masked).toMatch(/^••••/);
    expect(masked).not.toContain('sk-');
  });
});

describe('resolution corner: workspace isolation', () => {
  it('Workspace B sees nothing of Workspace A', async () => {
    const vault = new CredentialVault();
    vault._storage.set('ws-1:cred-a', createCredentialDefinition({ credentialId: 'cred-a', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY, secretMaterial: 'massive' }));
    await expect(vault.resolveCredential({ credentialId: 'cred-a', workspaceId: 'ws-2', credentialType: 'API_KEY' })).rejects.toThrow(CREDENTIAL_ERROR_CODES.CREDENTIAL_WORKSPACE_MISMATCH);
  });
});

describe('Vault lifecycle', () => {
  it('resolution returns ACTIVE with correct scoped identity + secret', async () => {
    const vault = new CredentialVault();
    const secret = 'sk-real-choice';
    const cred = createCredentialDefinition({ credentialId: 'cred-test', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY, secretMaterial: secret });
    vault._storage.set('ws-1:cred-test', cred);
    const found = await vault.resolveCredential({ credentialId: 'cred-test', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY });
    expect(found.secretMaterial).toBe(secret);
    expect(found.maskedHint).toBe('••••oice');
    expect(found.status).toBe(CREDENTIAL_STATUSES.ACTIVE);
    // raw secret stays a location-safe value only:
    const serialized = JSON.stringify(cred);
    expect(serialized).toContain('sk-real-choice'); // production-usable inside trusted server
    expect(JSON.stringify(await vault.resolveCredential({ credentialId: 'cred-test', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY }))).toContain(secret);
  });

  it('revoked credentials fail resolution', async () => {
    const vault = new CredentialVault();
    const base = createCredentialDefinition({ credentialId: 'cred-rev', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY, secretMaterial: 'massive' });
    vault._storage.set('ws-1:cred-rev', base);
    const revoked = await vault.revokeCredential({ credentialId: 'cred-rev', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY }, { revokedBy: person() });
    expect(revoked.status).toBe(CREDENTIAL_STATUSES.REVOKED);
    await expect(vault.resolveCredential({ credentialId: 'cred-rev', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY })).rejects.toThrow(CREDENTIAL_ERROR_CODES.CREDENTIAL_REVOKED);
  });

  it('"active version" must return fresh content after rotation', async () => {
    const vault = new CredentialVault();
    const original = createCredentialDefinition({ credentialId: 'cred-prod', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY, secretMaterial: 'sk-v1' });
    vault._storage.set('ws-1:cred-prod', original);
    const rotated = await vault.rotateCredential({ credentialId: 'cred-prod', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY }, { newSecretMaterial: 'sk-v2' });
    expect(rotated.version).toBe(2);
    expect((await vault.resolveCredential({ credentialId: 'cred-prod', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY })).secretMaterial).toBe('sk-v2');
  });

  it('expired credentials rejected after configured time', async () => {
    const vault = new CredentialVault();
    const expired = createCredentialDefinition({ credentialId: 'cred-exp', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY, secretMaterial: 'massive', expiresAt: '2025-01-01T00:00:00Z' });
    vault._storage.set('ws-1:cred-exp', expired);
    await expect(vault.resolveCredential({ credentialId: 'cred-exp', workspaceId: 'ws-1', credentialType: CREDENTIAL_TYPES.API_KEY })).rejects.toThrow(CREDENTIAL_ERROR_CODES.CREDENTIAL_DISABLED);
  });
});
