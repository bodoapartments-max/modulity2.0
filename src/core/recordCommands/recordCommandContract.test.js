import { describe, it, expect } from 'vitest';
import {
  buildCreateRecordCommand,
  validateRecordCommand,
  RECORD_COMMAND_CONTRACT_VERSION,
  RECORD_COMMAND_ERROR_CODES,
} from './recordCommandContract.js';

describe('recordCommandContract', () => {
  it('builds a CREATE_RECORD command', () => {
    const command = buildCreateRecordCommand({
      operationId: 'op-1',
      workspaceId: 'ws-1',
      moduleId: 'mod-1',
      values: { name: 'X' },
      isDraft: true,
    });
    expect(command.contractVersion).toBe(RECORD_COMMAND_CONTRACT_VERSION);
    expect(command.commandType).toBe('CREATE_RECORD');
    expect(command.operationId).toBe('op-1');
    expect(command.payload.workspaceId).toBe('ws-1');
    expect(command.payload.values.name).toBe('X');
    expect(command.payload.isDraft).toBe(true);
  });

  it('validates a correct command', () => {
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    expect(validateRecordCommand(command).valid).toBe(true);
  });

  it('rejects unsupported contract versions', () => {
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    const result = validateRecordCommand({ ...command, contractVersion: '99.0.0' });
    expect(result.valid).toBe(false);
    expect(result.code).toBe(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_CONTRACT_VERSION);
  });

  it('rejects unsupported command types', () => {
    const command = buildCreateRecordCommand({ operationId: 'op-1', workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    const result = validateRecordCommand({ ...command, commandType: 'DELETE_RECORD' });
    expect(result.valid).toBe(false);
    expect(result.code).toBe(RECORD_COMMAND_ERROR_CODES.UNSUPPORTED_COMMAND);
  });

  it('rejects missing operationId', () => {
    const command = buildCreateRecordCommand({ operationId: '', workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    const result = validateRecordCommand(command);
    expect(result.valid).toBe(false);
    expect(result.code).toBe(RECORD_COMMAND_ERROR_CODES.OPERATION_INVALID);
  });

  it('rejects oversized operationId', () => {
    const longId = 'x'.repeat(129);
    const command = buildCreateRecordCommand({ operationId: longId, workspaceId: 'ws-1', moduleId: 'mod-1', values: {} });
    const result = validateRecordCommand(command);
    expect(result.valid).toBe(false);
  });

  it('rejects executable-looking values', () => {
    const command = buildCreateRecordCommand({
      operationId: 'op-1',
      workspaceId: 'ws-1',
      moduleId: 'mod-1',
      values: { script: 'alert(1)' },
    });
    const result = validateRecordCommand(command);
    expect(result.valid).toBe(false);
  });
});
