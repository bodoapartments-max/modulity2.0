import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeFileCommand } from './fileCommandEngine.js';
import { createFakeDb } from './fakeDbHarness.js';

function cmd(commandType, payload, operationId = 'op-1') {
  return { contractVersion: '1.0.0', operationId, commandType, payload: { workspaceId: 'ws-1', ...payload } };
}

const SHA = 'a'.repeat(64);

function filePayload(overrides = {}) {
  return { name: 'invoice.pdf', mimeType: 'application/pdf', size: 1024, checksum: SHA, ...overrides };
}

function seedPersonal() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'PERSONAL', ownerUserId: 'u-anna' },
    'workspaces/ws-2': { workspaceId: 'ws-2', type: 'PERSONAL', ownerUserId: 'u-ben' },
    'workspaces/ws-1/records/rec-1': { recordId: 'rec-1', workspaceId: 'ws-1', status: 'SUBMITTED', data: {} },
    'workspaces/ws-1/entities/ent-1': { entityId: 'ent-1', workspaceId: 'ws-1', entityTypeId: 'vehicle' },
    'workspaces/ws-2/records/rec-b': { recordId: 'rec-b', workspaceId: 'ws-2', status: 'SUBMITTED' },
  };
}

function seedOrg() {
  return {
    'workspaces/ws-1': { workspaceId: 'ws-1', type: 'ORGANIZATION', organizationId: 'org-1' },
    'organizations/org-1/members/u-anna': { status: 'ACTIVE', roles: ['MEMBER'] },
    'workspaces/ws-1/records/rec-1': { recordId: 'rec-1', workspaceId: 'ws-1', status: 'SUBMITTED' },
  };
}

function code(err) { return err?.details?.code || err?.code; }

describe('fileCommand — CREATE_FILE', () => {
  it('creates canonical File + immutable v1 + event + audit', async () => {
    const db = createFakeDb(seedPersonal());
    const result = await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-c1') });
    assert.equal(result.idempotent, false);
    const file = result.resource;
    assert.equal(file.fileId, 'f_op-c1');
    assert.equal(file.workspaceId, 'ws-1');
    assert.equal(file.status, 'ACTIVE');
    assert.equal(file.source, 'USER_UPLOAD');
    assert.equal(file.currentVersion, 1);
    assert.equal(file.createdBy.actorId, 'u-anna');
    // Server-derived storage path — never from the payload.
    assert.equal(file.storagePath, 'workspaces/ws-1/files/f_op-c1/v1/invoice.pdf');
    // File Version doc is separate and immutable-identity.
    const v1 = await db.doc('workspaces/ws-1/files/f_op-c1/versions/v1').get();
    assert.equal(v1.exists, true);
    assert.equal(v1.data().version, 1);
    assert.equal(v1.data().checksum, SHA);
    // BusinessEvent + AuditEntry written in the same commit.
    assert.equal(db._docs.has('workspaces/ws-1/businessEvents/be_op-c1_file.created'), true);
    assert.equal(db._docs.has('workspaces/ws-1/auditEntries/op_op-c1_file.created'), true);
  });

  it('replays the same operationId idempotently — one file, one event', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-c2') });
    const again = await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-c2') });
    assert.equal(again.idempotent, true);
    assert.equal(again.resource.fileId, 'f_op-c2');
    assert.equal([...db._docs.keys()].filter((k) => k.startsWith('workspaces/ws-1/businessEvents/')).length, 1);
    assert.equal([...db._docs.keys()].filter((k) => /files\/f_op-c2$/.test(k)).length, 1);
  });

  it('rejects a conflicting payload for an existing operationId', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-c3') });
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ name: 'other.pdf' }), 'op-c3') }),
      (err) => code(err) === 'OPERATION_MISMATCH',
    );
  });

  it('rejects server-authoritative payload fields', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ storagePath: 'workspaces/ws-2/evil' }), 'op-c4') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
  });

  it('rejects non-claimable provenance sources from clients', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ source: 'GENERATED' }), 'op-c5') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ source: 'AGENT_PRODUCED' }), 'op-c5b') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
  });

  it('rejects oversized/unsupported uploads at the contract boundary', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ size: 51 * 1024 * 1024 }), 'op-c6') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ mimeType: 'not a mime' }), 'op-c7') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload({ checksum: 'bad' }), 'op-c8') }),
      (err) => code(err) === 'OPERATION_INVALID',
    );
  });
});

describe('fileCommand — workspace isolation', () => {
  it('denies personal-workspace file creation by a non-owner', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-ben', command: cmd('CREATE_FILE', filePayload(), 'op-w1') }),
      (err) => code(err) === 'WORKSPACE_FORBIDDEN',
    );
  });

  it('denies all operations for unauthenticated callers', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: null, command: cmd('CREATE_FILE', filePayload(), 'op-w2') }),
      (err) => code(err) === 'UNAUTHENTICATED',
    );
  });

  it('cannot attach a file to a target living in another workspace', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-w3') });
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ATTACH_FILE', { fileId: 'f_op-w3', targetType: 'RECORD', targetId: 'rec-b' }, 'op-w4') }),
      (err) => code(err) === 'TARGET_NOT_FOUND' || code(err) === 'WORKSPACE_FORBIDDEN',
    );
  });

  it('supports organization workspace members', async () => {
    const db = createFakeDb(seedOrg());
    const result = await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-w5') });
    assert.equal(result.resource.fileId, 'f_op-w5');
  });
});

describe('fileCommand — ATTACH / DETACH', () => {
  it('attaches to a canonical Record and maintains the derived index', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-a1') });
    const result = await executeFileCommand(db, {
      userId: 'u-anna',
      command: cmd('ATTACH_FILE', { fileId: 'f_op-a1', targetType: 'RECORD', targetId: 'rec-1' }, 'op-a2'),
    });
    const att = result.resource;
    assert.equal(att.attachmentId, 'att_op-a2');
    assert.equal(att.targetType, 'RECORD');
    assert.equal(att.targetId, 'rec-1');
    assert.equal(att.fileVersion, 1);
    assert.equal(att.status, 'ACTIVE');
    assert.deepEqual(db._docs.get('workspaces/ws-1/records/rec-1').attachments, ['f_op-a1']);
    assert.equal(db._docs.has('workspaces/ws-1/businessEvents/be_op-a2_file.attached'), true);
  });

  it('attaches to a canonical Entity', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-a3') });
    const result = await executeFileCommand(db, {
      userId: 'u-anna',
      command: cmd('ATTACH_FILE', { fileId: 'f_op-a3', targetType: 'ENTITY', targetId: 'ent-1' }, 'op-a4'),
    });
    assert.equal(result.resource.targetType, 'ENTITY');
    assert.deepEqual(db._docs.get('workspaces/ws-1/entities/ent-1').attachments, ['f_op-a3']);
  });

  it('rejects unsupported target types and unknown targets', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-a5') });
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ATTACH_FILE', { fileId: 'f_op-a5', targetType: 'CONVERSATION', targetId: 'x' }, 'op-a6') }),
      (err) => code(err) === 'OPERATION_INVALID' || code(err) === 'UNSUPPORTED_TARGET',
    );
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ATTACH_FILE', { fileId: 'f_op-a5', targetType: 'RECORD', targetId: 'ghost' }, 'op-a7') }),
      (err) => code(err) === 'TARGET_NOT_FOUND',
    );
  });

  it('detaches idempotently — relationship history preserved, index cleaned', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-d1') });
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('ATTACH_FILE', { fileId: 'f_op-d1', targetType: 'RECORD', targetId: 'rec-1' }, 'op-d2') });
    const result = await executeFileCommand(db, {
      userId: 'u-anna',
      command: cmd('DETACH_FILE', { attachmentId: 'att_op-d2' }, 'op-d3'),
    });
    assert.equal(result.resource.status, 'DETACHED');
    assert.ok(result.resource.detachedAt);
    // Attachment doc remains as canonical history.
    assert.equal(db._docs.get('workspaces/ws-1/fileAttachments/att_op-d2').status, 'DETACHED');
    // Derived index is cleaned.
    assert.deepEqual(db._docs.get('workspaces/ws-1/records/rec-1').attachments, []);
    // A second detach of the same attachment is an invalid transition.
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('DETACH_FILE', { attachmentId: 'att_op-d2' }, 'op-d4') }),
      (err) => code(err) === 'INVALID_FILE_STATE',
    );
    // Replaying the same detach operation is idempotent.
    const replay = await executeFileCommand(db, { userId: 'u-anna', command: cmd('DETACH_FILE', { attachmentId: 'att_op-d2' }, 'op-d3') });
    assert.equal(replay.idempotent, true);
  });
});

describe('fileCommand — versions + lifecycle', () => {
  it('appends version 2 and pins attachments to the current version', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-v1') });
    const v2 = await executeFileCommand(db, {
      userId: 'u-anna',
      command: cmd('CREATE_FILE_VERSION', { fileId: 'f_op-v1', name: 'invoice-v2.pdf', mimeType: 'application/pdf', size: 2048, checksum: 'b'.repeat(64) }, 'op-v2'),
    });
    assert.equal(v2.resource.version, 2);
    assert.equal(v2.resource.storagePath, 'workspaces/ws-1/files/f_op-v1/v2/invoice-v2.pdf');
    assert.equal(db._docs.get('workspaces/ws-1/files/f_op-v1').currentVersion, 2);
    // v1 doc remains untouched — historical identity preserved.
    assert.equal((await db.doc('workspaces/ws-1/files/f_op-v1/versions/v1').get()).data().checksum, SHA);
    const att = await executeFileCommand(db, {
      userId: 'u-anna',
      command: cmd('ATTACH_FILE', { fileId: 'f_op-v1', targetType: 'RECORD', targetId: 'rec-1' }, 'op-v3'),
    });
    assert.equal(att.resource.fileVersion, 2);
  });

  it('archives and restores reversibly; archived files cannot attach', async () => {
    const db = createFakeDb(seedPersonal());
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('CREATE_FILE', filePayload(), 'op-l1') });
    const archived = await executeFileCommand(db, { userId: 'u-anna', command: cmd('ARCHIVE_FILE', { fileId: 'f_op-l1' }, 'op-l2') });
    assert.equal(archived.resource.status, 'ARCHIVED');
    assert.ok(archived.resource.archivedBy.actorId);
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ATTACH_FILE', { fileId: 'f_op-l1', targetType: 'RECORD', targetId: 'rec-1' }, 'op-l3') }),
      (err) => code(err) === 'INVALID_FILE_STATE',
    );
    const restored = await executeFileCommand(db, { userId: 'u-anna', command: cmd('RESTORE_FILE', { fileId: 'f_op-l1' }, 'op-l4') });
    assert.equal(restored.resource.status, 'ACTIVE');
    assert.equal(db._docs.get('workspaces/ws-1/files/f_op-l1').archivedAt, null);
    // Double-archive is an invalid transition.
    await executeFileCommand(db, { userId: 'u-anna', command: cmd('ARCHIVE_FILE', { fileId: 'f_op-l1' }, 'op-l5') });
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ARCHIVE_FILE', { fileId: 'f_op-l1' }, 'op-l6') }),
      (err) => code(err) === 'INVALID_FILE_STATE',
    );
  });

  it('rejects lifecycle ops on unknown files and unknown attachments', async () => {
    const db = createFakeDb(seedPersonal());
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('ARCHIVE_FILE', { fileId: 'f_ghost' }, 'op-x1') }),
      (err) => code(err) === 'FILE_NOT_FOUND',
    );
    await assert.rejects(
      () => executeFileCommand(db, { userId: 'u-anna', command: cmd('DETACH_FILE', { attachmentId: 'att_ghost' }, 'op-x2') }),
      (err) => code(err) === 'ATTACHMENT_NOT_FOUND',
    );
  });
});
