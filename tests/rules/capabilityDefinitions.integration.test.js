/**
 * CapabilityDefinition Firestore Rules Tests
 *
 * Covers authorization, workspace isolation, and bounded configuration enforcement.
 */

/* eslint-disable no-undef */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } from 'firebase/firestore';

setLogLevel('error');

const PROJECT_ID = 'modulity-capability-rules-test';
const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
let testEnv;

function authedDb(userId) {
  return testEnv.authenticatedContext(userId).firestore();
}
function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function setupWorkspace(workspaceId, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'workspaces', workspaceId), {
      workspaceId,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

async function setupOrg(orgId, createdByUserId, members) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations', orgId), {
      organizationId: orgId,
      name: 'Test Org',
      type: 'COMPANY',
      createdByUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const member of members) {
      await setDoc(doc(db, 'organizations', orgId, 'members', member.userId), {
        organizationId: orgId,
        userId: member.userId,
        status: member.status || 'ACTIVE',
        roles: member.roles || ['MEMBER'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

function validCalendarDefinition(workspaceId, definitionId) {
  return {
    definitionId,
    definitionVersion: '1.0.0',
    workspaceId,
    engineId: 'calendar',
    contractVersion: '1.0.0',
    name: 'Reservations',
    description: '',
    source: { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId },
    configuration: { definitionType: 'CalendarDefinitionV1', mapping: { titleField: 'guestName', startField: 'arrivalDate', endField: 'departureDate' } },
    status: 'ACTIVE',
    createdBy: { actorType: 'USER', actorId: 'owner1' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeAll(async () => {
  const rules = readFileSync(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules, host: '127.0.0.1', port: 8080 } });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('capabilityDefinitions rules', () => {
  it('denies unauthenticated read', async () => {
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'workspaces/ws1/capabilityDefinitions/cal1')));
  });

  it('allows personal workspace owner to create and read', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    const def = validCalendarDefinition('ws-personal', 'cal1');
    await assertSucceeds(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), def));
    await assertSucceeds(getDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1')));
    const list = await assertSucceeds(getDocs(collection(db, 'workspaces/ws-personal/capabilityDefinitions')));
    expect(list.docs.length).toBe(1);
  });

  it('denies non-owner personal workspace access', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    await assertSucceeds(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), validCalendarDefinition('ws-personal', 'cal1')));
    const db2 = authedDb('other');
    await assertFails(getDoc(doc(db2, 'workspaces/ws-personal/capabilityDefinitions', 'cal1')));
    await assertFails(setDoc(doc(db2, 'workspaces/ws-personal/capabilityDefinitions', 'cal2'), validCalendarDefinition('ws-personal', 'cal2')));
  });

  it('allows org OWNER/ADMIN writes and MEMBER denial', async () => {
    await setupOrg('org1', 'owner1', [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-org', { type: 'ORGANIZATION', name: 'Org', ownerUserId: 'owner1', organizationId: 'org1' });

    const owner = authedDb('owner1');
    const admin = authedDb('admin1');
    const member = authedDb('member1');
    const def = validCalendarDefinition('ws-org', 'cal1');

    await assertSucceeds(setDoc(doc(owner, 'workspaces/ws-org/capabilityDefinitions', 'cal1'), def));
    await assertSucceeds(getDoc(doc(admin, 'workspaces/ws-org/capabilityDefinitions', 'cal1')));
    await assertFails(setDoc(doc(member, 'workspaces/ws-org/capabilityDefinitions', 'cal2'), def));
    await assertFails(updateDoc(doc(member, 'workspaces/ws-org/capabilityDefinitions', 'cal1'), { status: 'INACTIVE' }));
  });

  it('denies cross-workspace definition and source spoofing', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    const def = validCalendarDefinition('ws-personal', 'cal1');
    def.workspaceId = 'ws-other';
    await assertFails(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), def));

    const def2 = validCalendarDefinition('ws-personal', 'cal2');
    def2.source = { kind: 'MODULE', ref: 'module:RESERVATION', workspaceId: 'ws-other' };
    await assertFails(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal2'), def2));
  });

  it('denies arbitrary engine IDs and executable configuration', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    const def = validCalendarDefinition('ws-personal', 'cal1');
    def.engineId = 'arbitraryEngine';
    await assertFails(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), def));

    const def2 = validCalendarDefinition('ws-personal', 'cal2');
    def2.configuration.script = 'alert(1)';
    await assertFails(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal2'), def2));
  });

  it('enforces immutable identity/provenance on update', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    await assertSucceeds(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), validCalendarDefinition('ws-personal', 'cal1')));
    await assertFails(updateDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), { engineId: 'scheduling' }));
    await assertFails(updateDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), { workspaceId: 'ws-other' }));
    await assertSucceeds(updateDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), { status: 'INACTIVE' }));
  });

  it('allows authorized delete', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const db = authedDb('owner1');
    await assertSucceeds(setDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), validCalendarDefinition('ws-personal', 'cal1')));
    await assertSucceeds(deleteDoc(doc(db, 'workspaces/ws-personal/capabilityDefinitions', 'cal1')));
  });

  it('denies unauthorized delete', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', name: 'Mine', ownerUserId: 'owner1', organizationId: null });
    const owner = authedDb('owner1');
    await assertSucceeds(setDoc(doc(owner, 'workspaces/ws-personal/capabilityDefinitions', 'cal1'), validCalendarDefinition('ws-personal', 'cal1')));
    const other = authedDb('other');
    await assertFails(deleteDoc(doc(other, 'workspaces/ws-personal/capabilityDefinitions', 'cal1')));
  });
});
