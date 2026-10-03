import { describe, expect, it } from 'vitest';
import { createCapabilityDefinitionDocument, normalizeCapabilityDefinitionUpdates } from './capabilityDefinition.js';
import { CAPABILITY_DEFINITION_STATUSES } from '../contracts/capabilityContracts.js';

const base = {
  definitionId: 'def-1',
  workspaceId: 'ws-1',
  engineId: 'calendar',
  name: 'Reservations',
  source: { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId: 'ws-1' },
  configuration: { definitionType: 'CalendarDefinitionV1', mapping: { titleField: 'guestName', startField: 'arrivalDate' } },
  status: CAPABILITY_DEFINITION_STATUSES.ACTIVE,
  createdBy: { actorType: 'USER', actorId: 'user-1' },
};

describe('CapabilityDefinition document model', () => {
  it('creates a frozen generic CapabilityDefinition with provenance', () => {
    const doc = createCapabilityDefinitionDocument(base);
    expect(doc.definitionId).toBe('def-1');
    expect(doc.engineId).toBe('calendar');
    expect(doc.contractVersion).toBe('1.0.0');
    expect(doc.source.ref).toBe('module:RESERVATION');
    expect(doc.configuration.mapping.titleField).toBe('guestName');
    expect(Object.isFrozen(doc)).toBe(true);
  });

  it('rejects unsafe executable configuration', () => {
    expect(() => createCapabilityDefinitionDocument({ ...base, configuration: { script: 'alert(1)' } })).toThrow('Unsafe');
  });

  it('normalizes updates to protect immutable identity fields', () => {
    const changes = { name: 'New Name', definitionId: 'spoof', workspaceId: 'other', engineId: 'bad' };
    const safe = normalizeCapabilityDefinitionUpdates(base, changes);
    expect(safe.name).toBe('New Name');
    expect(safe.definitionId).toBeUndefined();
    expect(safe.workspaceId).toBeUndefined();
    expect(safe.engineId).toBeUndefined();
  });
});
