/**
 * Action Cards feature model tests (Step 31)
 */
import { describe, it, expect, vi } from 'vitest';
import { loadOpenActionCards, executeCardAction } from './model.js';

describe('loadOpenActionCards', () => {
  it('delegates to the read service', async () => {
    const cards = [{ actionCardId: 'ac_1' }];
    const svc = { listOpenCardsForUser: vi.fn().mockResolvedValue(cards) };
    const result = await loadOpenActionCards({ actionCardService: svc, workspaceId: 'ws1', userId: 'u2' });
    expect(svc.listOpenCardsForUser).toHaveBeenCalledWith('ws1', 'u2');
    expect(result).toBe(cards);
  });
});

describe('executeCardAction — closed action mapping', () => {
  it('APPROVAL_DECIDE maps to a DECIDE_APPROVAL trusted command', async () => {
    const approvalCommand = { decideApproval: vi.fn().mockResolvedValue({ ok: true }) };
    await executeCardAction({
      approvalCommand, workspaceId: 'ws1',
      action: { type: 'APPROVAL_DECIDE', approvalCaseId: 'appr_1', decision: 'APPROVE' },
      operationId: 'op-1',
    });
    expect(approvalCommand.decideApproval).toHaveBeenCalledWith({
      workspaceId: 'ws1', approvalCaseId: 'appr_1', decision: 'APPROVE', operationId: 'op-1',
    });
  });

  it('rejects non-executable card actions (VIEW_SUBJECT is navigation-only)', async () => {
    const approvalCommand = { decideApproval: vi.fn() };
    await expect(executeCardAction({
      approvalCommand, workspaceId: 'ws1',
      action: { type: 'VIEW_SUBJECT', subject: { type: 'RECORD', id: 'r1' } },
      operationId: 'op-1',
    })).rejects.toThrow(/Unsupported/);
    expect(approvalCommand.decideApproval).not.toHaveBeenCalled();
  });

  it('rejects arbitrary/injected action types — closed vocabulary only', async () => {
    await expect(executeCardAction({
      approvalCommand: { decideApproval: vi.fn() }, workspaceId: 'ws1',
      action: { type: 'RUN_URL', url: 'https://evil' },
      operationId: 'op-1',
    })).rejects.toThrow(/Unsupported/);
  });
});
