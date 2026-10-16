/**
 * Modulity 2.0 — Firebase Storage Security Rules Tests (Step 30)
 *
 * Runs against the Firebase Emulator Suite (storage + firestore).
 * Storage rules resolve workspace access through firestore.get, so both
 * emulators must be running (npm run test:rules).
 *
 * Coverage:
 * - canonical path uploads allowed only for workspace-authorized users
 * - cross-workspace read/write denial
 * - unauthenticated denial
 * - non-canonical path denial (deny-by-default)
 */

/* eslint-disable no-undef */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

setLogLevel('error');

// The storage emulator evaluates cross-service firestore.get against the
// EMULATOR's own project — pinned via `firebase emulators:exec --project
// modulity-storage-rules-test` in npm run test:rules. Distinct from the
// Firestore suite's project so parallel clears cannot wipe each other's seeds.
const PROJECT_ID = 'modulity-storage-rules-test';
const RULES_PATH = resolve(process.cwd(), 'storage.rules');

let testEnv;

const bytes = new Uint8Array([1, 2, 3]);

async function setupWorkspace(workspaceId, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'workspaces', workspaceId), {
      workspaceId,
      type: 'PERSONAL',
      ownerUserId: data.ownerUserId,
      name: 'WS',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

const PDF_META = { contentType: 'application/pdf' };

async function seedObject(path) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), bytes, PDF_META);
  });
}

beforeAll(async () => {
  const rules = readFileSync(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080 },
    storage: { rules, host: '127.0.0.1', port: 9199 },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('workspaces/{ws}/files/{fileId}/v{n}/{name}', () => {
  it('workspace owner can upload to and read from the canonical path', async () => {
    await setupWorkspace('ws-p', { ownerUserId: 'user1' });
    const storage = testEnv.authenticatedContext('user1').storage();
    const path = 'workspaces/ws-p/files/f_1/v1/doc.pdf';
    await assertSucceeds(uploadBytes(ref(storage, path), bytes, PDF_META));
    await assertSucceeds(getBytes(ref(storage, path)));
  });

  it('cross-workspace upload and download are denied', async () => {
    await setupWorkspace('ws-p2', { ownerUserId: 'user2' });
    const path = 'workspaces/ws-p2/files/f_9/v1/secret.pdf';
    await seedObject(path);
    const storage = testEnv.authenticatedContext('user1').storage();
    await assertFails(getBytes(ref(storage, path)));
    await assertFails(uploadBytes(ref(storage, 'workspaces/ws-p2/files/f_x/v1/x.pdf'), bytes, PDF_META));
  });

  it('uploads beyond the 50 MiB bound are denied', async () => {
    await setupWorkspace('ws-p', { ownerUserId: 'user1' });
    const storage = testEnv.authenticatedContext('user1').storage();
    const oversize = new Uint8Array(50 * 1024 * 1024 + 1);
    await assertFails(
      uploadBytes(ref(storage, 'workspaces/ws-p/files/f_1/v1/big.bin'), oversize, { contentType: 'application/octet-stream' }),
    );
  });

  it('unauthenticated access is denied', async () => {
    await setupWorkspace('ws-p', { ownerUserId: 'user1' });
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, 'workspaces/ws-p/files/f_1/v1/a.pdf'), bytes, PDF_META));
    await assertFails(getBytes(ref(storage, 'workspaces/ws-p/files/f_1/v1/a.pdf')));
  });

  it('non-canonical paths are denied by default', async () => {
    await setupWorkspace('ws-p', { ownerUserId: 'user1' });
    const storage = testEnv.authenticatedContext('user1').storage();
    await assertFails(uploadBytes(ref(storage, 'arbitrary/path/file.pdf'), bytes, PDF_META));
    await assertFails(uploadBytes(ref(storage, 'workspaces/ws-p/other/f.pdf'), bytes, PDF_META));
    await assertFails(uploadBytes(ref(storage, 'files/f_1/v1/a.pdf'), bytes, PDF_META));
  });

  it('uploads to nonexistent workspaces are denied (fail-closed)', async () => {
    const storage = testEnv.authenticatedContext('user1').storage();
    await assertFails(uploadBytes(ref(storage, 'workspaces/ws-ghost/files/f_1/v1/a.pdf'), bytes, PDF_META));
  });
});
