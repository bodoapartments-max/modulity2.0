import { describe, it, expect } from 'vitest';
import { createShareToken, generateShareToken, hashShareToken, SHARE_TOKEN_STATUSES, SHARE_TOKEN_SCOPES } from './secureShare.js';

describe('secureShare', () => {
  const actorRef = { actorType: 'USER', actorId: 'user-1' };

  const baseArgs = {
    tokenId: 'tok-1',
    workspaceId: 'ws-1',
    recordId: 'rec-1',
    tokenHash: 'abc123hash',
    createdBy: actorRef,
  };

  it('creates a valid share token', () => {
    const t = createShareToken(baseArgs);
    expect(t.tokenId).toBe('tok-1');
    expect(t.scope).toBe(SHARE_TOKEN_SCOPES.READ);
    expect(t.status).toBe(SHARE_TOKEN_STATUSES.ACTIVE);
    expect(t.maxRedemptions).toBe(1);
    expect(t.redemptionCount).toBe(0);
  });

  it('rejects missing tokenId', () => {
    expect(() => createShareToken({ ...baseArgs, tokenId: '' })).toThrow('tokenId is required');
  });

  it('rejects missing workspaceId', () => {
    expect(() => createShareToken({ ...baseArgs, workspaceId: '' })).toThrow('workspaceId is required');
  });

  it('rejects missing recordId', () => {
    expect(() => createShareToken({ ...baseArgs, recordId: '' })).toThrow('recordId is required');
  });

  it('rejects missing tokenHash', () => {
    expect(() => createShareToken({ ...baseArgs, tokenHash: '' })).toThrow('tokenHash is required');
  });

  it('rejects missing createdBy', () => {
    expect(() => createShareToken({ ...baseArgs, createdBy: null })).toThrow('createdBy is required');
  });

  it('rejects invalid scope', () => {
    expect(() => createShareToken({ ...baseArgs, scope: 'WRITE' })).toThrow('Invalid share token scope');
  });

  it('rejects invalid status', () => {
    expect(() => createShareToken({ ...baseArgs, status: 'INVALID' })).toThrow('Invalid share token status');
  });

  it('freezes the result', () => {
    const t = createShareToken(baseArgs);
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.createdBy)).toBe(true);
  });

  it('accepts RESPOND scope', () => {
    const t = createShareToken({ ...baseArgs, scope: SHARE_TOKEN_SCOPES.RESPOND });
    expect(t.scope).toBe('RESPOND');
  });
});

describe('generateShareToken', () => {
  it('generates a 64-char hex string', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const t1 = generateShareToken();
    const t2 = generateShareToken();
    expect(t1).not.toBe(t2);
  });
});

describe('hashShareToken', () => {
  it('produces a consistent hash', async () => {
    const h1 = await hashShareToken('test-token');
    const h2 = await hashShareToken('test-token');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different tokens', async () => {
    const h1 = await hashShareToken('token-a');
    const h2 = await hashShareToken('token-b');
    expect(h1).not.toBe(h2);
  });

  it('returns a hex string', async () => {
    const h = await hashShareToken('test');
    expect(h).toMatch(/^[0-9a-f]+$/);
  });
});
