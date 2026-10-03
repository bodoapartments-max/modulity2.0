import { describe, it, expect } from 'vitest';
import { createModule, MODULE_STATUSES } from '../../modules/module.js';
import { buildCreateRecordCommand } from './recordCommandContract.js';
import { validateCreateRecordCommand, buildCanonicalRecordFromCommand } from './recordCommandEngine.js';
import { RECORD_STATUSES } from '../data/record.js';

const actorId = 'user-1';

function makeModule(overrides = {}) {
  return createModule({
    moduleId: 'mod-1',
    workspaceId: 'ws-1',
    moduleCode: 'TEST_MOD',
    name: 'Test Module',
    status: MODULE_STATUSES.ACTIVE,
    version: 1,
    formSchema: {
      schemaVersion: '1.0.0',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'ref', label: 'Entity', type: 'entity-reference', entityTypeId: 'et-1', required: false },
      ],
    },
    createdBy: { actorType: 'USER', actorId: actorId },
    ...overrides,
  });
}

describe('recordCommandEngine', () => {
  it('validates a valid CREATE_RECORD command', () => {
    const mod = makeModule();
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: { name: 'X', date: '2024-01-01' } });
    const result = validateCreateRecordCommand(command, mod);
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const mod = makeModule();
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    const result = validateCreateRecordCommand(command, mod);
    expect(result.valid).toBe(false);
  });

  it('rejects archived module', () => {
    const mod = makeModule({ status: MODULE_STATUSES.ARCHIVED });
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: { name: 'X', date: '2024-01-01' } });
    const result = validateCreateRecordCommand(command, mod);
    expect(result.valid).toBe(false);
  });

  it('rejects cross-workspace entity reference', () => {
    const mod = makeModule();
    const command = buildCreateRecordCommand({
      operationId: 'op-1',
      workspaceId: 'ws-1',
      moduleId: 'mod-1',
      values: { name: 'X', date: '2024-01-01', ref: { entityId: 'e1', entityTypeId: 'et-1', workspaceId: 'ws-2' } },
    });
    const result = validateCreateRecordCommand(command, mod);
    expect(result.valid).toBe(false);
  });

  it('builds a canonical SUBMITTED Record', () => {
    const mod = makeModule();
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: { name: 'X', date: '2024-01-01' } });
    const record = buildCanonicalRecordFromCommand({ command, module: mod, actorId, recordId: 'rec-1', now: '2024-01-01T00:00:00.000Z' });
    expect(record.recordId).toBe('rec-1');
    expect(record.workspaceId).toBe('ws-1');
    expect(record.moduleId).toBe('mod-1');
    expect(record.moduleVersion).toBe(1);
    expect(record.recordType).toBe('TEST_MOD');
    expect(record.status).toBe(RECORD_STATUSES.SUBMITTED);
    expect(record.createdBy.actorId).toBe(actorId);
    expect(record.submittedBy.actorId).toBe(actorId);
    expect(record.submittedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('builds a canonical DRAFT Record', () => {
    const mod = makeModule();
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: { name: 'X' }, isDraft: true });
    const record = buildCanonicalRecordFromCommand({ command, module: mod, actorId, recordId: 'rec-1' });
    expect(record.status).toBe(RECORD_STATUSES.DRAFT);
    expect(record.submittedBy).toBeNull();
    expect(record.submittedAt).toBeNull();
  });
});
