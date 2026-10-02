/* eslint-disable no-undef */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { createWorkspaceService, personalWorkspaceId } from '../../src/core/workspace/workspaceService.js';
import { createFirestoreWorkspaceRepository } from '../../src/infrastructure/firebase/firestoreWorkspaceRepository.js';
import { createFirestorePersonRepository } from '../../src/infrastructure/firebase/firestorePersonRepository.js';
import { createFirestoreLedgerBookRepository } from '../../src/infrastructure/firebase/firestoreLedgerBookRepository.js';
import {
  createFirestoreWorksetRepository,
  createFirestoreWidgetRepository,
  createFirestoreNotificationRepository,
  createFirestoreWorkspacePreferenceRepository,
} from '../../src/infrastructure/firebase/firestoreWorkspaceExperienceRepositories.js';

const PROJECT_ID = 'modulity-workspace-bootstrap-test';
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => { if (testEnv) await testEnv.cleanup(); });
beforeEach(async () => testEnv.clearFirestore());

describe('empty Personal Workspace runtime integration', () => {
  it('bootstraps idempotently and all empty workspace queries settle', async () => {
    const user = { userId: 'new-user', email: 'new@example.com', displayName: 'New User' };
    const db = testEnv.authenticatedContext(user.userId).firestore();
    const service = createWorkspaceService({
      workspaceRepo: createFirestoreWorkspaceRepository(db),
      personRepo: createFirestorePersonRepository(db),
    });

    const [first, second] = await Promise.all([
      service.ensurePersonalWorkspace(user),
      service.ensurePersonalWorkspace(user),
    ]);
    expect(first.workspaceId).toBe(personalWorkspaceId(user.userId));
    expect(second.workspaceId).toBe(first.workspaceId);

    const workspaceSnapshot = await getDocs(query(
      collection(db, 'workspaces'),
      where('ownerUserId', '==', user.userId),
      where('type', '==', 'PERSONAL'),
    ));
    expect(workspaceSnapshot.size).toBe(1);

    const workspaceId = first.workspaceId;
    const ledger = createFirestoreLedgerBookRepository(db);
    const worksets = createFirestoreWorksetRepository(db);
    const widgets = createFirestoreWidgetRepository(db);
    const notifications = createFirestoreNotificationRepository(db);
    const preferences = createFirestoreWorkspacePreferenceRepository(db);

    const results = await Promise.all([
      getDocs(collection(db, 'workspaces', workspaceId, 'modules')),
      getDocs(collection(db, 'workspaces', workspaceId, 'records')),
      getDocs(collection(db, 'workspaces', workspaceId, 'entities')),
      getDocs(collection(db, 'workspaces', workspaceId, 'entityTypes')),
      ledger.listByWorkspace(workspaceId),
      worksets.listByWorkspace(workspaceId),
      widgets.listForUser(workspaceId, user.userId),
      notifications.listForUser(workspaceId, user.userId),
      preferences.get(workspaceId, user.userId),
    ]);

    expect(results.slice(0, 4).every((snapshot) => snapshot.empty)).toBe(true);
    expect(results.slice(4, 8).every((items) => items.length === 0)).toBe(true);
    expect(results[8]).toBeNull();
  });
});
