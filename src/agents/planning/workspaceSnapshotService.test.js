import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceSnapshotService, snapshotFingerprint } from './workspaceSnapshotService.js';

function repository(list = []) { return { listByWorkspace: vi.fn().mockResolvedValue(list), create: vi.fn() }; }

describe('bounded Workspace planning snapshot', () => {
  it('loads only bounded configuration summaries in parallel and exposes no mutation path', async () => {
    const repositories = {
      entityTypes: repository([{ typeId: 'room', code: 'ROOM', fields: [], entities: [{ entityId: 'excluded' }] }]),
      modules: repository([{ moduleId: 'reservation', moduleCode: 'RESERVATION', formSchema: { fields: [] }, records: [{ recordId: 'excluded' }] }]),
      relationships: repository(), worksets: repository(), reports: repository(),
      widgets: { listByWorkspace: vi.fn().mockResolvedValue([]), create: vi.fn() },
    };
    const service = createWorkspaceSnapshotService({ repositories });
    const snapshot = await service.load('workspace-1', 'user-1');
    expect(repositories.entityTypes.listByWorkspace).toHaveBeenCalledWith('workspace-1', 100);
    expect(repositories.modules.listByWorkspace).toHaveBeenCalledWith('workspace-1', 100);
    expect(repositories.relationships.listByWorkspace).toHaveBeenCalledWith('workspace-1', 100);
    expect(repositories.widgets.listByWorkspace).toHaveBeenCalledWith('workspace-1');
    expect(snapshot).not.toHaveProperty('records');
    expect(snapshot).not.toHaveProperty('entities');
    expect(snapshot.modules[0]).not.toHaveProperty('records');
    expect(snapshot.entityTypes[0]).not.toHaveProperty('entities');
    Object.values(repositories).forEach((repo) => expect(repo.create).not.toHaveBeenCalled());
  });

  it('verifies canonical configuration is unchanged independent of read ordering', () => {
    const service = createWorkspaceSnapshotService({ repositories: {} });
    const before = { workspaceId: 'workspace-1', modules: [{ moduleId: 'b' }, { moduleId: 'a' }] };
    const after = { workspaceId: 'workspace-1', modules: [{ moduleId: 'a' }, { moduleId: 'b' }] };
    expect(snapshotFingerprint(before)).toBe(snapshotFingerprint(after));
    expect(service.assertUnchanged(before, after)).toBe(true);
    expect(() => service.assertUnchanged(before, { workspaceId: 'workspace-1', modules: [] })).toThrow('changed during planning');
  });
});
