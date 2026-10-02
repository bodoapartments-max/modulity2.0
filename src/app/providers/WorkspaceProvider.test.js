import { describe, expect, it } from 'vitest';
import { resolveWorkspaceTarget } from './WorkspaceProvider.jsx';

const personal = { workspaceId: 'personal-1', type: 'PERSONAL' };
const organization = { workspaceId: 'org-workspace-1', type: 'ORGANIZATION', organizationId: 'org-1' };

describe('resolveWorkspaceTarget', () => {
  it('uses the freshly created Workspace override before React state refreshes', () => {
    expect(resolveWorkspaceTarget(organization.workspaceId, [personal], organization)).toBe(organization);
  });

  it('uses an existing available Workspace and rejects mismatched overrides', () => {
    expect(resolveWorkspaceTarget(personal.workspaceId, [personal], organization)).toBe(personal);
    expect(resolveWorkspaceTarget('missing', [personal], organization)).toBeNull();
  });
});
