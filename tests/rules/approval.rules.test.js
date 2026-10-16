/**
 * Modulity 2.0 — Approval / Action Card Firestore Rules Tests (Step 31)
 *
 * ApprovalCases, ApprovalDefinitions and ActionCards are server-authored
 * only: workspace members get bounded read access; ALL browser writes are
 * denied — mutations flow through the trusted approvalCommand boundary.
 *
 * Runs against the Firebase Emulator Suite. Never touches real data.
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  setLogLevel,
} from 'firebase/firestore';

setLogLevel('error');

const PROJECT_ID = 'modulity-approval-rules-test';
const RULES_PATH = resolve(process.cwd(), 'firestore.rules');

let testEnv;

function authedDb(userId) { return testEnv.authenticatedContext(userId).firestore(); }
function unauthedDb() { return testEnv.unauthenticatedContext().firestore(); }

async function seedOrg() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'organizations', 'orgA'), { organizationId: 'orgA', name: 'Org A' });
    await setDoc(doc(db, 'organizations', 'orgA', 'members', 'u-anna'), { userId: 'u-anna', status: 'ACTIVE', roles: ['MEMBER'] });
    await setDoc(doc(db, 'organizations', 'orgA', 'members', 'u-ben'), { userId: 'u-ben', status: 'ACTIVE', roles: ['MEMBER'] });
    await setDoc(doc(db, 'organizations', 'orgB'), { organizationId: 'orgB', name: 'Org B' });
    await setDoc(doc(db, 'organizations', 'orgB', 'members', 'u-zed'), { userId: 'u-zed', status: 'ACTIVE', roles: ['MEMBER'] });

    await setDoc(doc(db, 'workspaces', 'wsA'), { workspaceId: 'wsA', type: 'ORGANIZATION', organizationId: 'orgA' });
    await setDoc(doc(db, 'workspaces', 'wsB'), { workspaceId: 'wsB', type: 'ORGANIZATION', organizationId: 'orgB' });
    await setDoc(doc(db, 'workspaces', 'wsP'), { workspaceId: 'wsP', type: 'PERSONAL', ownerUserId: 'u-anna' });

    const caseDoc = {
      approvalCaseId: 'appr_1', workspaceId: 'wsA', requestType: 'TRUSTED_COMMAND',
      status: 'PENDING', currentStepIndex: 0,
      requestedBy: { actorType: 'USER', actorId: 'u-anna' },
      steps: [{ stepIndex: 0, quorum: 'ANY_ONE', status: 'PENDING', assignments: [{ approverUserId: 'u-ben', status: 'PENDING', decisionId: null }] }],
      decisions: [],
    };
    await setDoc(doc(db, 'workspaces', 'wsA', 'approvalCases', 'appr_1'), caseDoc);
    await setDoc(doc(db, 'workspaces', 'wsB', 'approvalCases', 'appr_b'), { ...caseDoc, approvalCaseId: 'appr_b', workspaceId: 'wsB' });
    await setDoc(doc(db, 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_1'), {
      approvalDefinitionId: 'apdef_1', workspaceId: 'wsA', name: 'Standard', status: 'ACTIVE', version: 1,
      steps: [{ quorum: 'ANY_ONE', approverUserIds: ['u-ben'] }],
    });
    await setDoc(doc(db, 'workspaces', 'wsA', 'actionCards', 'ac_1'), {
      actionCardId: 'ac_1', workspaceId: 'wsA', type: 'APPROVAL', status: 'OPEN',
      title: 'Approve', audienceUserIds: ['u-ben'],
      sourceReference: { type: 'APPROVAL_CASE', id: 'appr_1' },
    });
  });
}

beforeAll(async () => {
  const rules = readFileSync(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

beforeEach(async () => { await testEnv.clearFirestore(); await seedOrg(); });
afterAll(async () => { await testEnv.cleanup(); });

describe('approvalCases — reads', () => {
  it('org members can read a case in their workspace', async () => {
    await assertSucceeds(getDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalCases', 'appr_1')));
    await assertSucceeds(getDoc(doc(authedDb('u-ben'), 'workspaces', 'wsA', 'approvalCases', 'appr_1')));
  });

  it('cross-workspace read is denied — a case id is not a discovery vector', async () => {
    await assertFails(getDoc(doc(authedDb('u-zed'), 'workspaces', 'wsA', 'approvalCases', 'appr_1')));
    await assertFails(getDoc(doc(authedDb('u-anna'), 'workspaces', 'wsB', 'approvalCases', 'appr_b')));
  });

  it('unauthenticated reads are denied', async () => {
    await assertFails(getDoc(doc(unauthedDb(), 'workspaces', 'wsA', 'approvalCases', 'appr_1')));
  });

  it('cross-workspace listing is denied', async () => {
    await assertFails(getDocs(collection(authedDb('u-zed'), 'workspaces', 'wsA', 'approvalCases')));
    await assertSucceeds(getDocs(collection(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalCases')));
  });
});

describe('approvalCases — writes denied (trusted boundary only)', () => {
  it('members cannot create a case directly', async () => {
    await assertFails(setDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalCases', 'appr_evil'), {
      approvalCaseId: 'appr_evil', workspaceId: 'wsA', status: 'APPROVED',
      requestedBy: { actorType: 'USER', actorId: 'u-anna' },
    }));
  });

  it('members cannot forge a decision or status on an existing case', async () => {
    const ref = doc(authedDb('u-ben'), 'workspaces', 'wsA', 'approvalCases', 'appr_1');
    await assertFails(updateDoc(ref, { status: 'APPROVED' }));
    await assertFails(updateDoc(ref, { decisions: [{ decision: 'APPROVE', decidedBy: { actorId: 'u-ben' } }] }));
    await assertFails(updateDoc(ref, { 'execution.status': 'EXECUTED' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('approvalDefinitions — reads + write denial', () => {
  it('members read definitions; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_1')));
    await assertFails(getDoc(doc(authedDb('u-zed'), 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_1')));
  });

  it('definitions are server-authored only', async () => {
    await assertFails(setDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_evil'), { name: 'x' }));
    await assertFails(updateDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_1'), { steps: [] }));
    await assertFails(deleteDoc(doc(authedDb('u-anna'), 'workspaces', 'wsA', 'approvalDefinitions', 'apdef_1')));
  });
});

describe('actionCards — projection access', () => {
  it('members read cards; cross-workspace and unauthenticated denied', async () => {
    await assertSucceeds(getDoc(doc(authedDb('u-ben'), 'workspaces', 'wsA', 'actionCards', 'ac_1')));
    await assertFails(getDoc(doc(authedDb('u-zed'), 'workspaces', 'wsA', 'actionCards', 'ac_1')));
    await assertFails(getDoc(doc(unauthedDb(), 'workspaces', 'wsA', 'actionCards', 'ac_1')));
  });

  it('cards are server-authored only — no client create/update/delete', async () => {
    const ref = doc(authedDb('u-ben'), 'workspaces', 'wsA', 'actionCards', 'ac_1');
    await assertFails(setDoc(doc(authedDb('u-ben'), 'workspaces', 'wsA', 'actionCards', 'ac_evil'), { actionCardId: 'ac_evil', status: 'OPEN' }));
    await assertFails(updateDoc(ref, { status: 'CLOSED' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('personal workspace approvals', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'workspaces', 'wsP', 'approvalCases', 'appr_p'), {
        approvalCaseId: 'appr_p', workspaceId: 'wsP', status: 'PENDING',
        requestedBy: { actorType: 'USER', actorId: 'u-anna' },
      });
    });
  });

  it('owner reads; non-owner and unauthenticated denied', async () => {
    await assertSucceeds(getDoc(doc(authedDb('u-anna'), 'workspaces', 'wsP', 'approvalCases', 'appr_p')));
    await assertFails(getDoc(doc(authedDb('u-ben'), 'workspaces', 'wsP', 'approvalCases', 'appr_p')));
    await assertFails(getDoc(doc(unauthedDb(), 'workspaces', 'wsP', 'approvalCases', 'appr_p')));
  });
});
