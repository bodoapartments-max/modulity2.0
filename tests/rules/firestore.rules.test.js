/**
 * Modulity 2.0 — Firestore Security Rules Tests
 *
 * Tests run against Firebase Emulator Suite. Never touches real data.
 *
 * Coverage:
 * - Personal workspace isolation
 * - Organization isolation (cross-org access denied)
 * - Membership role enforcement (self-promotion, escalation)
 * - Owner invariant protection
 * - Group access isolation
 * - Invitation security
 * - Unauthenticated access denied
 * - Deny-by-default for unknown collections
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
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  setLogLevel,
  writeBatch,
} from 'firebase/firestore';

setLogLevel('error');

const PROJECT_ID = 'modulity-rules-test';
const RULES_PATH = resolve(process.cwd(), 'firestore.rules');

let testEnv;

function authedDb(userId) {
  return testEnv.authenticatedContext(userId).firestore();
}

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function setupOrg(orgId, orgData, members) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'organizations', orgId), {
      organizationId: orgId,
      name: orgData.name || 'Test Org',
      type: orgData.type || 'COMPANY',
      country: orgData.country || 'HU',
      description: '',
      createdByUserId: orgData.createdByUserId || 'owner1',
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

      await setDoc(doc(db, 'userMemberships', member.userId, 'orgs', orgId), {
        organizationId: orgId,
        userId: member.userId,
        status: member.status || 'ACTIVE',
        roles: member.roles || ['MEMBER'],
      });
    }
  });
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

async function setupUser(userId, data = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', userId), {
      userId,
      displayName: data.displayName || 'Test User',
      email: data.email || `${userId}@test.com`,
      phone: '',
      avatarUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

// ═══════════════════════════════════════════════════════
// 1. USER / PERSON PROFILE
// ═══════════════════════════════════════════════════════

describe('users/{userId} (person profile)', () => {
  it('user can read own profile', async () => {
    await setupUser('user1');
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'users', 'user1')));
  });

  it('user cannot read another user profile', async () => {
    await setupUser('user1');
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'users', 'user1')));
  });

  it('user can create own profile', async () => {
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'users', 'user1'), {
      userId: 'user1',
      displayName: 'User 1',
      email: 'user1@test.com',
      phone: '',
      avatarUrl: '',
    }));
  });

  it('user cannot create another user profile', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'users', 'user2'), {
      userId: 'user2',
      displayName: 'User 2',
      email: 'user2@test.com',
    }));
  });

  it('unauthenticated cannot read user profile', async () => {
    await setupUser('user1');
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'users', 'user1')));
  });
});

// ═══════════════════════════════════════════════════════
// 2. PERSONAL WORKSPACE
// ═══════════════════════════════════════════════════════

describe('workspaces — personal', () => {
  it('owner can read own personal workspace', async () => {
    await setupWorkspace('ws-personal-1', {
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-personal-1')));
  });

  it('another user cannot read someone else personal workspace', async () => {
    await setupWorkspace('ws-personal-1', {
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    });
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-personal-1')));
  });

  it('user can create own personal workspace', async () => {
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-new'), {
      workspaceId: 'ws-new',
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    }));
  });

  it('user cannot create personal workspace for another user', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-new'), {
      workspaceId: 'ws-new',
      type: 'PERSONAL',
      name: 'Stolen Workspace',
      ownerUserId: 'user2',
      organizationId: null,
    }));
  });

  it('owner cannot change workspace type', async () => {
    await setupWorkspace('ws-personal-1', {
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-personal-1'), {
      type: 'ORGANIZATION',
    }));
  });

  it('owner cannot change ownerUserId', async () => {
    await setupWorkspace('ws-personal-1', {
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-personal-1'), {
      ownerUserId: 'user2',
    }));
  });

  it('unauthenticated cannot access personal workspace', async () => {
    await setupWorkspace('ws-personal-1', {
      type: 'PERSONAL',
      name: 'My Workspace',
      ownerUserId: 'user1',
      organizationId: null,
    });
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-personal-1')));
  });
});

// ═══════════════════════════════════════════════════════
// 3. ORGANIZATION WORKSPACE
// ═══════════════════════════════════════════════════════

describe('workspaces — organization', () => {
  it('active member can read org workspace', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-org1', {
      type: 'ORGANIZATION',
      name: 'Org Workspace',
      ownerUserId: 'org1',
      organizationId: 'org1',
    });
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-org1')));
  });

  it('non-member cannot read org workspace', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await setupWorkspace('ws-org1', {
      type: 'ORGANIZATION',
      name: 'Org Workspace',
      ownerUserId: 'org1',
      organizationId: 'org1',
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-org1')));
  });

  it('suspended member cannot read org workspace', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'suspended1', roles: ['MEMBER'], status: 'SUSPENDED' },
    ]);
    await setupWorkspace('ws-org1', {
      type: 'ORGANIZATION',
      name: 'Org Workspace',
      ownerUserId: 'org1',
      organizationId: 'org1',
    });
    const db = authedDb('suspended1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-org1')));
  });
});

// ═══════════════════════════════════════════════════════
// 4. ORGANIZATIONS
// ═══════════════════════════════════════════════════════

describe('organizations/{organizationId}', () => {
  it('active member can read org', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'organizations', 'org1')));
  });

  it('non-member cannot read org', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'organizations', 'org1')));
  });

  it('authenticated user can create an org', async () => {
    const db = authedDb('creator1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'new-org'), {
      organizationId: 'new-org',
      name: 'New Org',
      type: 'COMPANY',
      country: 'HU',
      description: '',
      createdByUserId: 'creator1',
    }));
  });

  it('cannot create org with someone else as creator', async () => {
    const db = authedDb('creator1');
    await assertFails(setDoc(doc(db, 'organizations', 'new-org'), {
      organizationId: 'new-org',
      name: 'Stolen Org',
      type: 'COMPANY',
      country: 'HU',
      description: '',
      createdByUserId: 'someone-else',
    }));
  });

  it('owner can update org name', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'org1'), {
      name: 'Updated Name',
    }));
  });

  it('admin can update org description', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'org1'), {
      description: 'Updated description',
    }));
  });

  it('member cannot update org', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1'), {
      name: 'Hacked Name',
    }));
  });

  it('owner cannot change createdByUserId', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1'), {
      createdByUserId: 'hacker',
    }));
  });

  it('non-member cannot update org', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('outsider');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1'), {
      name: 'Cross-org attack',
    }));
  });

  it('unauthenticated cannot read org', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'organizations', 'org1')));
  });
});

// ═══════════════════════════════════════════════════════
// 5. MEMBERSHIP SECURITY
// ═══════════════════════════════════════════════════════

describe('organizations/{orgId}/members/{userId}', () => {
  it('active member can read members list', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'organizations', 'org1', 'members', 'owner1')));
  });

  it('non-member cannot read members', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'organizations', 'org1', 'members', 'owner1')));
  });

  it('creator can bootstrap own OWNER membership', async () => {
    const db = authedDb('creator1');
    await setDoc(doc(db, 'organizations', 'new-org'), {
      organizationId: 'new-org',
      name: 'New Org',
      type: 'COMPANY',
      country: 'HU',
      description: '',
      createdByUserId: 'creator1',
    });
    await assertSucceeds(setDoc(doc(db, 'organizations', 'new-org', 'members', 'creator1'), {
      organizationId: 'new-org',
      userId: 'creator1',
      status: 'ACTIVE',
      roles: ['OWNER'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('member cannot create arbitrary OWNER membership', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'members', 'hacker'), {
      organizationId: 'org1',
      userId: 'hacker',
      status: 'ACTIVE',
      roles: ['OWNER'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('owner can add a MEMBER to org', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org1', 'members', 'newmember'), {
      organizationId: 'org1',
      userId: 'newmember',
      status: 'ACTIVE',
      roles: ['MEMBER'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('admin can add a MEMBER to org', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org1', 'members', 'newmember'), {
      organizationId: 'org1',
      userId: 'newmember',
      status: 'ACTIVE',
      roles: ['MEMBER'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('admin cannot add an OWNER to org', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'members', 'newowner'), {
      organizationId: 'org1',
      userId: 'newowner',
      status: 'ACTIVE',
      roles: ['OWNER'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  });

  it('member cannot promote themselves to ADMIN', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      roles: ['ADMIN'],
    }));
  });

  it('member cannot promote themselves to OWNER', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      roles: ['OWNER'],
    }));
  });

  it('admin cannot promote member to OWNER', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('admin1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      roles: ['OWNER'],
    }));
  });

  it('owner can promote member to ADMIN', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('owner1');
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      roles: ['ADMIN'],
    }));
  });

  it('owner cannot promote themselves (self-modification blocked)', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'owner1'), {
      roles: ['OWNER', 'ADMIN'],
    }));
  });

  it('cannot change membership organizationId', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      organizationId: 'org2',
    }));
  });

  it('cannot change membership userId', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      userId: 'hacker',
    }));
  });

  it('owner can suspend a member', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('owner1');
    await assertSucceeds(updateDoc(doc(db, 'organizations', 'org1', 'members', 'member1'), {
      status: 'SUSPENDED',
    }));
  });

  it('member cannot reactivate after suspension', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'suspended1', roles: ['MEMBER'], status: 'SUSPENDED' },
    ]);
    const db = authedDb('suspended1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'members', 'suspended1'), {
      status: 'ACTIVE',
    }));
  });

  it('member cannot delete membership', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(deleteDoc(doc(db, 'organizations', 'org1', 'members', 'member1')));
  });
});

// ═══════════════════════════════════════════════════════
// 6. GROUPS
// ═══════════════════════════════════════════════════════

describe('organizations/{orgId}/groups/{groupId}', () => {
  it('active member can read groups', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org1',
        name: 'Reception',
      });
    });
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1')));
  });

  it('non-member cannot read groups', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org1',
        name: 'Reception',
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1')));
  });

  it('owner can create group', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp-new'), {
      groupId: 'grp-new',
      organizationId: 'org1',
      name: 'New Group',
    }));
  });

  it('admin can create group', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp-new'), {
      groupId: 'grp-new',
      organizationId: 'org1',
      name: 'New Group',
    }));
  });

  it('member cannot create group', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp-new'), {
      groupId: 'grp-new',
      organizationId: 'org1',
      name: 'Unauthorized Group',
    }));
  });

  it('cannot create group with wrong organizationId', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp-new'), {
      groupId: 'grp-new',
      organizationId: 'org-other',
      name: 'Cross-org group',
    }));
  });

  it('cannot change group organizationId', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org1',
        name: 'Original',
      });
    });
    const db = authedDb('owner1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
      organizationId: 'org2',
    }));
  });

  it('owner can delete group', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org1',
        name: 'To Delete',
      });
    });
    const db = authedDb('owner1');
    await assertSucceeds(deleteDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1')));
  });

  it('member cannot delete group', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org1',
        name: 'Protected Group',
      });
    });
    const db = authedDb('member1');
    await assertFails(deleteDoc(doc(db, 'organizations', 'org1', 'groups', 'grp1')));
  });
});

// ═══════════════════════════════════════════════════════
// 7. INVITATIONS
// ═══════════════════════════════════════════════════════

describe('organizations/{orgId}/invitations/{invId}', () => {
  it('admin can create invitation (non-OWNER role)', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1'), {
      invitationId: 'inv1',
      organizationId: 'org1',
      email: 'invitee@test.com',
      role: 'MEMBER',
      invitedByUserId: 'admin1',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }));
  });

  it('admin cannot create invitation with OWNER role', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    const db = authedDb('admin1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1'), {
      invitationId: 'inv1',
      organizationId: 'org1',
      email: 'invitee@test.com',
      role: 'OWNER',
      invitedByUserId: 'admin1',
      status: 'PENDING',
    }));
  });

  it('member cannot create invitation', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1'), {
      invitationId: 'inv1',
      organizationId: 'org1',
      email: 'invitee@test.com',
      role: 'MEMBER',
      invitedByUserId: 'member1',
      status: 'PENDING',
    }));
  });

  it('non-member cannot read invitations', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1'), {
        invitationId: 'inv1',
        organizationId: 'org1',
        email: 'invitee@test.com',
        role: 'MEMBER',
        invitedByUserId: 'owner1',
        status: 'PENDING',
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1')));
  });

  it('cannot spoof invitedByUserId', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    const db = authedDb('owner1');
    await assertFails(setDoc(doc(db, 'organizations', 'org1', 'invitations', 'inv1'), {
      invitationId: 'inv1',
      organizationId: 'org1',
      email: 'invitee@test.com',
      role: 'MEMBER',
      invitedByUserId: 'someone-else',
      status: 'PENDING',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 8. USER MEMBERSHIP INDEX
// ═══════════════════════════════════════════════════════

describe('userMemberships/{userId}/orgs/{orgId}', () => {
  it('user can read own membership index', async () => {
    await setupOrg('org1', {}, [
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'userMemberships', 'member1', 'orgs', 'org1')));
  });

  it('user cannot read another user membership index', async () => {
    await setupOrg('org1', {}, [
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    const db = authedDb('snooper');
    await assertFails(getDoc(doc(db, 'userMemberships', 'member1', 'orgs', 'org1')));
  });
});

// ═══════════════════════════════════════════════════════
// 9. CROSS-ORGANIZATION ISOLATION
// ═══════════════════════════════════════════════════════

describe('cross-organization isolation', () => {
  it('org1 member cannot read org2 data', async () => {
    await setupOrg('org1', {}, [
      { userId: 'user1', roles: ['OWNER'] },
    ]);
    await setupOrg('org2', {}, [
      { userId: 'user2', roles: ['OWNER'] },
    ]);
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'organizations', 'org2')));
  });

  it('org1 member cannot read org2 members', async () => {
    await setupOrg('org1', {}, [
      { userId: 'user1', roles: ['OWNER'] },
    ]);
    await setupOrg('org2', {}, [
      { userId: 'user2', roles: ['OWNER'] },
    ]);
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'organizations', 'org2', 'members', 'user2')));
  });

  it('org1 member cannot read org2 groups', async () => {
    await setupOrg('org1', {}, [
      { userId: 'user1', roles: ['OWNER'] },
    ]);
    await setupOrg('org2', {}, [
      { userId: 'user2', roles: ['OWNER'] },
    ]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'organizations', 'org2', 'groups', 'grp1'), {
        groupId: 'grp1',
        organizationId: 'org2',
        name: 'Secret Group',
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'organizations', 'org2', 'groups', 'grp1')));
  });

  it('org1 owner cannot update org2', async () => {
    await setupOrg('org1', {}, [
      { userId: 'user1', roles: ['OWNER'] },
    ]);
    await setupOrg('org2', {}, [
      { userId: 'user2', roles: ['OWNER'] },
    ]);
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'organizations', 'org2'), {
      name: 'Hacked',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 10. WORKSPACE DATA — ENTITY TYPES
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/entityTypes/{typeId}', () => {
  it('personal workspace owner can read entity types', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle'), {
        typeId: 'core:vehicle', code: 'VEHICLE', name: 'Vehicle',
        category: 'CORE', workspaceId: 'ws-personal', status: 'ACTIVE',
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle')));
  });

  it('other user cannot read personal workspace entity types', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle'), {
        typeId: 'core:vehicle', code: 'VEHICLE', name: 'Vehicle',
        category: 'CORE', workspaceId: 'ws-personal', status: 'ACTIVE',
      });
    });
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle')));
  });

  it('org member can read org workspace entity types', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
        typeId: 'room-type', code: 'ROOM', name: 'Room',
        category: 'DOMAIN', workspaceId: 'ws-org1', status: 'ACTIVE',
      });
    });
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type')));
  });

  it('non-member cannot read org workspace entity types', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
        typeId: 'room-type', code: 'ROOM', name: 'Room',
        category: 'DOMAIN', workspaceId: 'ws-org1', status: 'ACTIVE',
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type')));
  });

  it('Step 17.3 — browsers can no longer create DOMAIN entity types (trusted boundary)', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-type'), {
      typeId: 'my-type', code: 'CUSTOM', name: 'Custom Type',
      category: 'DOMAIN', workspaceId: 'ws-personal', status: 'ACTIVE',
    }));
  });

  it('cannot create entity type with wrong workspaceId', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-type'), {
      typeId: 'my-type', code: 'CUSTOM', name: 'Custom Type',
      category: 'DOMAIN', workspaceId: 'wrong-ws', status: 'ACTIVE',
    }));
  });

  it('CORE entity type cannot be updated', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle'), {
        typeId: 'core:vehicle', code: 'VEHICLE', name: 'Vehicle',
        category: 'CORE', workspaceId: 'ws-personal', status: 'ACTIVE',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'core:vehicle'), {
      name: 'Modified Vehicle',
    }));
  });

  it('Step 17.3 — DOMAIN entity type updates are denied to browsers (trusted boundary)', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
        typeId: 'room-type', code: 'ROOM', name: 'Room',
        category: 'DOMAIN', workspaceId: 'ws-org1', status: 'ACTIVE',
      });
    });
    const db = authedDb('admin1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
      name: 'Hotel Room',
    }));
  });

  it('org member cannot update DOMAIN entity type', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
        typeId: 'room-type', code: 'ROOM', name: 'Room',
        category: 'DOMAIN', workspaceId: 'ws-org1', status: 'ACTIVE',
      });
    });
    const db = authedDb('member1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-org1', 'entityTypes', 'room-type'), {
      name: 'Modified Room',
    }));
  });

  it('cannot change entity type category', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-domain'), {
        typeId: 'my-domain', code: 'CUSTOM', name: 'Custom',
        category: 'DOMAIN', workspaceId: 'ws-personal', status: 'ACTIVE',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-domain'), {
      category: 'CORE',
    }));
  });

  it('entity type cannot be deleted', async () => {
    await setupWorkspace('ws-personal', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-type'), {
        typeId: 'my-type', code: 'CUSTOM', name: 'Custom',
        category: 'DOMAIN', workspaceId: 'ws-personal', status: 'ACTIVE',
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-personal', 'entityTypes', 'my-type')));
  });
});

// ═══════════════════════════════════════════════════════
// 11. WORKSPACE DATA — ENTITIES
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/entities/{entityId}', () => {
  it('personal workspace owner can read entities', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1')));
  });

  it('other user cannot read personal workspace entities', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1')));
  });

  it('Step 17.3 — browsers cannot create entities directly (trusted boundary)', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-org1', 'entities', 'ent-new'), {
      entityId: 'ent-new', workspaceId: 'ws-org1', entityTypeId: 'core:vehicle',
      displayName: 'New Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'member1' },
    }));
  });

  it('Step 17.3 — browser entity updates are denied (trusted boundary)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'workspaces', 'ws-p', 'entities', 'ent-1'), { entityId: 'ent-1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle', displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' } });
    });
    await assertFails(updateDoc(doc(authedDb('user1'), 'workspaces', 'ws-p', 'entities', 'ent-1'), { displayName: 'Renamed' }));
  });

  it('denies invalid Entity lifecycle status', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await assertFails(setDoc(doc(authedDb('user1'), 'workspaces', 'ws-p', 'entities', 'invalid-status'), { entityId: 'invalid-status', workspaceId: 'ws-p', entityTypeId: 'core:vehicle', displayName: 'Invalid', status: 'DELETED', data: {}, createdBy: { actorType: 'USER', actorId: 'user1' } }));
  });

  it('non-member cannot create entity in org workspace', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await setupWorkspace('ws-org1', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    const db = authedDb('outsider');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-org1', 'entities', 'ent-new'), {
      entityId: 'ent-new', workspaceId: 'ws-org1', entityTypeId: 'core:vehicle',
      displayName: 'Hacked', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'outsider' },
    }));
  });

  it('cannot create entity with wrong workspaceId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent-new'), {
      entityId: 'ent-new', workspaceId: 'wrong-ws', entityTypeId: 'core:vehicle',
      displayName: 'Bad', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('cannot change entity workspaceId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
      workspaceId: 'other-ws',
    }));
  });

  it('cannot change entity createdBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
      createdBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });

  it('entity cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1')));
  });
});

// ═══════════════════════════════════════════════════════
// 12. WORKSPACE DATA — RECORDS
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/records/{recordId}', () => {
  it('direct client record creation is denied (trusted callable only)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      recordId: 'rec1', workspaceId: 'ws-p', recordType: 'ROOM_INSPECTION',
      status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('unauthorized record creation denied', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user2');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      recordId: 'rec1', workspaceId: 'ws-p', recordType: 'ROOM_INSPECTION',
      status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user2' },
    }));
  });

  it('cross-workspace record access denied', async () => {
    await setupWorkspace('ws-p1', { type: 'PERSONAL', ownerUserId: 'user1', name: 'WS1' });
    await setupWorkspace('ws-p2', { type: 'PERSONAL', ownerUserId: 'user2', name: 'WS2' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p2', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p2', recordType: 'TEST',
        status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user2' },
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p2', 'records', 'rec1')));
  });

  it('record workspaceId immutable', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', recordType: 'TEST',
        status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      workspaceId: 'other-ws',
    }));
  });

  it('record createdBy immutable', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', recordType: 'TEST',
        status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      createdBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 13. WORKSPACE DATA — RELATIONSHIPS
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/relationships/{relId}', () => {
  it('workspace owner can create relationship', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel1'), {
      relationshipId: 'rel1', workspaceId: 'ws-p', relationshipType: 'PART_OF',
      source: { objectType: 'ENTITY', objectId: 'ent1' },
      target: { objectType: 'ENTITY', objectId: 'ent2' },
      status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('cross-workspace relationship creation denied', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user2');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel1'), {
      relationshipId: 'rel1', workspaceId: 'ws-p', relationshipType: 'PART_OF',
      source: { objectType: 'ENTITY', objectId: 'ent1' },
      target: { objectType: 'ENTITY', objectId: 'ent2' },
      status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user2' },
    }));
  });

  it('relationship workspaceId immutable', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel1'), {
        relationshipId: 'rel1', workspaceId: 'ws-p', relationshipType: 'PART_OF',
        source: { objectType: 'ENTITY', objectId: 'ent1' },
        target: { objectType: 'ENTITY', objectId: 'ent2' },
        status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel1'), {
      workspaceId: 'other-ws',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 14. WORKSPACE DATA — FILES
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/files/{fileId}', () => {
  it('workspace owner can create file metadata', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file1'), {
      fileId: 'file1', workspaceId: 'ws-p', name: 'photo.jpg',
      mimeType: 'image/jpeg', size: 1024, storagePath: '/files/photo.jpg',
      uploadedBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('cross-workspace file access denied', async () => {
    await setupWorkspace('ws-p1', { type: 'PERSONAL', ownerUserId: 'user1', name: 'WS1' });
    await setupWorkspace('ws-p2', { type: 'PERSONAL', ownerUserId: 'user2', name: 'WS2' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p2', 'files', 'file1'), {
        fileId: 'file1', workspaceId: 'ws-p2', name: 'secret.pdf',
        mimeType: 'application/pdf', size: 2048, storagePath: '/files/secret.pdf',
        uploadedBy: { actorType: 'USER', actorId: 'user2' },
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p2', 'files', 'file1')));
  });

  it('file metadata cannot be updated', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file1'), {
        fileId: 'file1', workspaceId: 'ws-p', name: 'photo.jpg',
        mimeType: 'image/jpeg', size: 1024, storagePath: '/files/photo.jpg',
        uploadedBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file1'), {
      name: 'renamed.jpg',
    }));
  });

  it('file metadata cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file1'), {
        fileId: 'file1', workspaceId: 'ws-p', name: 'photo.jpg',
        mimeType: 'image/jpeg', size: 1024, storagePath: '/files/photo.jpg',
        uploadedBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file1')));
  });
});

// ═══════════════════════════════════════════════════════
// 15. CROSS-WORKSPACE DATA ISOLATION
// ═══════════════════════════════════════════════════════

describe('cross-workspace data isolation', () => {
  it('user1 cannot read user2 entities via personal workspace', async () => {
    await setupWorkspace('ws-u1', { type: 'PERSONAL', ownerUserId: 'user1', name: 'U1' });
    await setupWorkspace('ws-u2', { type: 'PERSONAL', ownerUserId: 'user2', name: 'U2' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-u2', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-u2', entityTypeId: 'core:vehicle',
        displayName: 'Secret Car', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user2' },
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-u2', 'entities', 'ent1')));
  });

  it('user1 cannot write to user2 workspace entities', async () => {
    await setupWorkspace('ws-u2', { type: 'PERSONAL', ownerUserId: 'user2', name: 'U2' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-u2', 'entities', 'ent-hack'), {
      entityId: 'ent-hack', workspaceId: 'ws-u2', entityTypeId: 'core:vehicle',
      displayName: 'Hacked', status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('org1 member cannot read org2 workspace entities', async () => {
    await setupOrg('org1', {}, [{ userId: 'user1', roles: ['OWNER'] }]);
    await setupOrg('org2', {}, [{ userId: 'user2', roles: ['OWNER'] }]);
    await setupWorkspace('ws-org2', { type: 'ORGANIZATION', organizationId: 'org2', name: 'Org2 WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org2', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-org2', entityTypeId: 'core:vehicle',
        displayName: 'Org2 Car', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user2' },
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-org2', 'entities', 'ent1')));
  });

  it('org1 member cannot read org2 workspace records', async () => {
    await setupOrg('org1', {}, [{ userId: 'user1', roles: ['OWNER'] }]);
    await setupOrg('org2', {}, [{ userId: 'user2', roles: ['OWNER'] }]);
    await setupWorkspace('ws-org2', { type: 'ORGANIZATION', organizationId: 'org2', name: 'Org2 WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-org2', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-org2', recordType: 'TEST',
        status: 'DRAFT', createdBy: { actorType: 'USER', actorId: 'user2' },
      });
    });
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-org2', 'records', 'rec1')));
  });
});

// ═══════════════════════════════════════════════════════
// 16. ACTOR IDENTITY ENFORCEMENT
// ═══════════════════════════════════════════════════════

describe('actor identity enforcement', () => {
  // ─── Entity actor spoofing ─────────────────────────
  it('cannot create entity claiming another USER as createdBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent-spoof'), {
      entityId: 'ent-spoof', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
      displayName: 'Spoofed', status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'someone-else' },
    }));
  });

  it('cannot create entity claiming INTERNAL_AGENT actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent-agent'), {
      entityId: 'ent-agent', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
      displayName: 'Agent Car', status: 'ACTIVE',
      createdBy: { actorType: 'INTERNAL_AGENT', actorId: 'user1' },
    }));
  });

  it('cannot create entity claiming EXTERNAL_INTEGRATION actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent-ext'), {
      entityId: 'ent-ext', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
      displayName: 'External Car', status: 'ACTIVE',
      createdBy: { actorType: 'EXTERNAL_INTEGRATION', actorId: 'user1' },
    }));
  });

  // ─── Record actor spoofing ─────────────────────────
  it('cannot create record claiming another USER as createdBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-spoof'), {
      recordId: 'rec-spoof', workspaceId: 'ws-p', recordType: 'TEST',
      status: 'DRAFT',
      createdBy: { actorType: 'USER', actorId: 'someone-else' },
    }));
  });

  it('cannot create record claiming INTERNAL_AGENT actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-agent'), {
      recordId: 'rec-agent', workspaceId: 'ws-p', recordType: 'TEST',
      status: 'DRAFT',
      createdBy: { actorType: 'INTERNAL_AGENT', actorId: 'user1' },
    }));
  });

  // ─── Relationship actor spoofing ───────────────────
  it('cannot create relationship claiming another USER as createdBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel-spoof'), {
      relationshipId: 'rel-spoof', workspaceId: 'ws-p', relationshipType: 'PART_OF',
      source: { objectType: 'ENTITY', objectId: 'ent1' },
      target: { objectType: 'ENTITY', objectId: 'ent2' },
      status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'someone-else' },
    }));
  });

  it('cannot create relationship claiming INTERNAL_AGENT actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'relationships', 'rel-agent'), {
      relationshipId: 'rel-agent', workspaceId: 'ws-p', relationshipType: 'PART_OF',
      source: { objectType: 'ENTITY', objectId: 'ent1' },
      target: { objectType: 'ENTITY', objectId: 'ent2' },
      status: 'ACTIVE',
      createdBy: { actorType: 'INTERNAL_AGENT', actorId: 'user1' },
    }));
  });

  // ─── File actor spoofing ───────────────────────────
  it('cannot create file claiming another USER as uploadedBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file-spoof'), {
      fileId: 'file-spoof', workspaceId: 'ws-p', name: 'photo.jpg',
      mimeType: 'image/jpeg', size: 1024, storagePath: '/files/photo.jpg',
      uploadedBy: { actorType: 'USER', actorId: 'someone-else' },
    }));
  });

  it('cannot create file claiming EXTERNAL_INTEGRATION actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'files', 'file-ext'), {
      fileId: 'file-ext', workspaceId: 'ws-p', name: 'photo.jpg',
      mimeType: 'image/jpeg', size: 1024, storagePath: '/files/photo.jpg',
      uploadedBy: { actorType: 'EXTERNAL_INTEGRATION', actorId: 'user1' },
    }));
  });

  // ─── Positive: valid actor succeeds ────────────────
  it('Step 17.3 — entity creation even with valid USER actor is denied (trusted callable only)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent-valid'), {
      entityId: 'ent-valid', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
      displayName: 'Valid Car', status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('record creation with valid USER actor is still denied (trusted callable only)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-valid'), {
      recordId: 'rec-valid', workspaceId: 'ws-p', recordType: 'TEST',
      status: 'DRAFT',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  // ─── Immutable actor fields on update ──────────────
  it('entity createdBy cannot be changed to different actor on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
        entityId: 'ent1', workspaceId: 'ws-p', entityTypeId: 'core:vehicle',
        displayName: 'Car', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'entities', 'ent1'), {
      createdBy: { actorType: 'USER', actorId: 'attacker' },
    }));
  });

  it('record createdBy cannot be changed to different actor on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', recordType: 'TEST',
        status: 'DRAFT',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      createdBy: { actorType: 'USER', actorId: 'attacker' },
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 17. MODULES — workspaces/{workspaceId}/modules/{moduleId}
// ═══════════════════════════════════════════════════════

describe('modules (workspace-scoped)', () => {
  // ── Personal Workspace ──

  it('Step 17.3 — browsers cannot create Modules (trusted boundary)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod1',
      workspaceId: 'ws-p',
      moduleCode: 'TEST',
      name: 'Test Module',
      status: 'DRAFT',
      version: 1,
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('personal workspace owner can read own module', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1')));
  });

  it('non-owner cannot read personal workspace modules', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1')));
  });

  it('non-owner cannot create module in personal workspace', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user2');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user2' },
    }));
  });

  // ── Organization Workspace ──

  it('Step 17.3 — org OWNER cannot create Modules from the browser', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    const db = authedDb('owner1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'owner1' },
    }));
  });

  it('Step 17.3 — org ADMIN cannot create Modules from the browser', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    const db = authedDb('admin1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'admin1' },
    }));
  });

  it('org MEMBER cannot create module in org workspace', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'member1' },
    }));
  });

  it('org MEMBER can read modules in org workspace', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'owner1' },
      });
    });
    const db = authedDb('member1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1')));
  });

  // ── Cross-workspace isolation ──

  it('user cannot read modules from another users personal workspace', async () => {
    await setupWorkspace('ws-alien', { type: 'PERSONAL', ownerUserId: 'alien' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-alien', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-alien', moduleCode: 'SECRET', name: 'Secret',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'alien' },
      });
    });
    const db = authedDb('attacker');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-alien', 'modules', 'mod1')));
  });

  it('non-member cannot access org workspace modules', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'owner1' },
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1')));
  });

  // ── Actor spoofing protection ──

  it('rejects create with spoofed actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1,
      createdBy: { actorType: 'USER', actorId: 'someone-else' },
    }));
  });

  it('rejects create with non-USER actor type', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1,
      createdBy: { actorType: 'SERVICE', actorId: 'user1' },
    }));
  });

  // ── Workspace field mismatch ──

  it('rejects create with mismatched workspaceId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod1', workspaceId: 'ws-OTHER', moduleCode: 'TEST', name: 'Test',
      status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  // ── Immutable fields on update ──

  it('rejects update changing workspaceId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      workspaceId: 'ws-HACKED',
    }));
  });

  it('rejects update changing moduleId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleId: 'mod-HACKED',
    }));
  });

  it('rejects update changing moduleCode', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      moduleCode: 'HACKED',
    }));
  });

  it('rejects update changing createdBy', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      createdBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });

  // ── Archived module protection ──

  it('rejects update on archived module (status change)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ARCHIVED', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      status: 'ACTIVE',
    }));
  });

  it('allows safe metadata update on DRAFT module', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
      name: 'Updated Name',
      description: 'Updated description',
    }));
  });

  // ── Delete protection ──

  it('cannot delete modules', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'DRAFT', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1')));
  });

  // ── Unauthenticated access ──

  it('unauthenticated cannot read modules', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1')));
  });
});

// ═══════════════════════════════════════════════════════
// 18. MODULE VERSION SNAPSHOTS (Step 4.1)
// ═══════════════════════════════════════════════════════

describe('modules/{moduleId}/versions/{version} (immutable snapshots)', () => {
  const versionData = {
    moduleId: 'mod1',
    workspaceId: 'ws-p',
    version: 1,
    moduleCode: 'TEST',
    name: 'Test Module v1',
    formSchema: { schemaVersion: '1.0.0', fields: [{ key: 'a', label: 'A', type: 'text' }] },
    recordConfig: { recordType: 'TEST' },
    displayConfig: {},
    primaryEntityTypeId: null,
    createdBy: { actorType: 'USER', actorId: 'user1' },
  };

  it('workspace owner can create version snapshot', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      versionData,
    ));
  });

  it('workspace owner can read version snapshot', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'), versionData);
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1')));
  });

  it('version snapshot update DENIED (immutable)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'), versionData);
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      { name: 'TAMPERED' },
    ));
  });

  it('version snapshot delete DENIED (immutable)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'), versionData);
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1')));
  });

  it('cross-workspace version read DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'), versionData);
    });
    const db = authedDb('attacker');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1')));
  });

  it('cross-workspace version write DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('attacker');
    await assertFails(setDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, createdBy: { actorType: 'USER', actorId: 'attacker' } },
    ));
  });

  it('spoofed actor in version create DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, createdBy: { actorType: 'USER', actorId: 'fake-user' } },
    ));
  });

  it('mismatched moduleId in version create DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, moduleId: 'WRONG-MODULE' },
    ));
  });

  it('mismatched workspaceId in version data DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-p', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(
      doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, workspaceId: 'ws-HACKED' },
    ));
  });

  it('org ADMIN can create version snapshot', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'owner1' },
      });
    });
    const db = authedDb('admin1');
    await assertSucceeds(setDoc(
      doc(db, 'workspaces', 'ws-o', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, workspaceId: 'ws-o', createdBy: { actorType: 'USER', actorId: 'admin1' } },
    ));
  });

  it('org MEMBER cannot create version snapshot', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-o', 'modules', 'mod1'), {
        moduleId: 'mod1', workspaceId: 'ws-o', moduleCode: 'TEST', name: 'Test',
        status: 'ACTIVE', version: 1, createdBy: { actorType: 'USER', actorId: 'owner1' },
      });
    });
    const db = authedDb('member1');
    await assertFails(setDoc(
      doc(db, 'workspaces', 'ws-o', 'modules', 'mod1', 'versions', '1'),
      { ...versionData, workspaceId: 'ws-o', createdBy: { actorType: 'USER', actorId: 'member1' } },
    ));
  });

  it('unauthenticated cannot read version snapshot', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1'), versionData);
    });
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'modules', 'mod1', 'versions', '1')));
  });
});

// ═══════════════════════════════════════════════════════
// 19. MODULE CODE RESERVATIONS (Step 4.1)
// ═══════════════════════════════════════════════════════

describe('moduleCodes (workspace-scoped reservations)', () => {
  const reservationData = {
    moduleCode: 'TEST',
    moduleId: 'mod1',
    workspaceId: 'ws-p',
    reservedBy: { actorType: 'USER', actorId: 'user1' },
  };

  it('workspace owner can create code reservation', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData));
  });

  it('workspace owner can read code reservation', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData);
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST')));
  });

  it('reservation update DENIED (immutable)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData);
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), {
      moduleId: 'HIJACKED',
    }));
  });

  it('reservation delete DENIED (permanent)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData);
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST')));
  });

  it('cross-workspace reservation read DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData);
    });
    const db = authedDb('attacker');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST')));
  });

  it('cross-workspace reservation create DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('attacker');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'STOLEN'), {
      ...reservationData, moduleCode: 'STOLEN',
      reservedBy: { actorType: 'USER', actorId: 'attacker' },
    }));
  });

  it('spoofed actor in reservation DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), {
      ...reservationData, reservedBy: { actorType: 'USER', actorId: 'fake-user' },
    }));
  });

  it('mismatched workspaceId in reservation DENIED', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), {
      ...reservationData, workspaceId: 'ws-HACKED',
    }));
  });

  it('org ADMIN can create reservation', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'admin1', roles: ['ADMIN'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    const db = authedDb('admin1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-o', 'moduleCodes', 'TEST'), {
      ...reservationData, workspaceId: 'ws-o',
      reservedBy: { actorType: 'USER', actorId: 'admin1' },
    }));
  });

  it('org MEMBER cannot create reservation', async () => {
    await setupOrg('org1', { createdByUserId: 'owner1' }, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1' });
    const db = authedDb('member1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-o', 'moduleCodes', 'TEST'), {
      ...reservationData, workspaceId: 'ws-o',
      reservedBy: { actorType: 'USER', actorId: 'member1' },
    }));
  });

  it('unauthenticated cannot read reservations', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST'), reservationData);
    });
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'moduleCodes', 'TEST')));
  });
});

// ═══════════════════════════════════════════════════════
// 20. RECORD PROVENANCE IMMUTABILITY (Step 4.1)
// ═══════════════════════════════════════════════════════

describe('record provenance immutability (moduleId, moduleVersion, recordType)', () => {
  it('record moduleId immutable on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        recordType: 'TEST', status: 'DRAFT',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      moduleId: 'HACKED-MODULE',
    }));
  });

  it('record moduleVersion immutable on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        recordType: 'TEST', status: 'DRAFT',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      moduleVersion: 99,
    }));
  });

  it('record recordType immutable on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        recordType: 'TEST', status: 'DRAFT',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      recordType: 'HACKED_TYPE',
    }));
  });

  it('record status update DENIED from browser (Step 15: lifecycle is trusted-command only)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        recordType: 'TEST', status: 'DRAFT',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      status: 'SUBMITTED',
    }));
  });

  it('record data update DENIED from browser (Step 15: UPDATE_DRAFT is trusted-command only)', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
        recordId: 'rec1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        recordType: 'TEST', status: 'DRAFT', data: { name: 'old' },
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec1'), {
      data: { name: 'updated' },
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 21. DELIVERIES (Step 5)
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/deliveries/{deliveryId}', () => {
  it('workspace owner can create delivery', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
      deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user1' },
      recipientUserId: 'user2', status: 'PENDING',
    }));
  });

  it('non-owner cannot create delivery in personal workspace', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user2');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
      deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user2' },
      recipientUserId: 'user1', status: 'PENDING',
    }));
  });

  it('cannot create delivery with spoofed sender', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
      deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'fake' },
      recipientUserId: 'user2', status: 'PENDING',
    }));
  });

  it('cannot create delivery with wrong workspaceId', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      deliveryId: 'del1', workspaceId: 'wrong-ws', recordId: 'rec1',
      deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user1' },
      recipientUserId: 'user2', status: 'PENDING',
    }));
  });

  it('delivery immutable fields protected on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
        deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
        deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      recordId: 'rec-hacked',
    }));
  });

  it('delivery status update allowed', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
        deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
        deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
      status: 'DELIVERED',
    }));
  });

  it('delivery cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1'), {
        deliveryId: 'del1', workspaceId: 'ws-p', recordId: 'rec1',
        deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'deliveries', 'del1')));
  });

  it('org member can create delivery in org workspace', async () => {
    await setupOrg('org1', {}, [
      { userId: 'owner1', roles: ['OWNER'] },
      { userId: 'member1', roles: ['MEMBER'] },
    ]);
    await setupWorkspace('ws-o', { type: 'ORGANIZATION', organizationId: 'org1', name: 'Org WS' });
    const db = authedDb('member1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-o', 'deliveries', 'del1'), {
      deliveryId: 'del1', workspaceId: 'ws-o', recordId: 'rec1',
      deliveryType: 'SHARE', sender: { actorType: 'USER', actorId: 'member1' },
      recipientUserId: 'owner1', status: 'PENDING',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 22. FORM REQUESTS (Step 5)
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/formRequests/{requestId}', () => {
  it('workspace owner can create form request', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
      requester: { actorType: 'USER', actorId: 'user1' },
      recipientUserId: 'user2', status: 'PENDING',
    }));
  });

  it('form request immutable fields protected on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      moduleId: 'mod-hacked',
    }));
  });

  it('form request moduleVersion immutable on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      moduleVersion: 99,
    }));
  });

  it('form request status update allowed', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      status: 'CANCELLED',
    }));
  });

  it('form request cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user2', status: 'PENDING',
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1')));
  });
});

// ═══════════════════════════════════════════════════════
// 23. FOLDERS & FOLDER ITEMS (Step 5)
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/folders/{folderId}', () => {
  it('workspace owner can create folder', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
      folderId: 'folder1', workspaceId: 'ws-p', name: 'Important',
      scope: 'USER', ownerUserId: 'user1',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('folder immutable fields protected on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
        folderId: 'folder1', workspaceId: 'ws-p', name: 'Important',
        scope: 'USER', ownerUserId: 'user1',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
      createdBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });

  it('user can delete own USER-scoped folder', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
        folderId: 'folder1', workspaceId: 'ws-p', name: 'Mine',
        scope: 'USER', ownerUserId: 'user1',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(deleteDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1')));
  });
});

describe('workspaces/{wsId}/folders/{folderId}/items/{itemId}', () => {
  it('workspace owner can add folder item', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
        folderId: 'folder1', workspaceId: 'ws-p', name: 'My Folder',
        scope: 'USER', ownerUserId: 'user1',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1', 'items', 'item1'), {
      itemId: 'item1', folderId: 'folder1', recordId: 'rec1', addedBy: 'user1',
    }));
  });

  it('non-owner cannot add folder item to personal workspace', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
        folderId: 'folder1', workspaceId: 'ws-p', name: 'My Folder',
        scope: 'USER', ownerUserId: 'user1',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user2');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1', 'items', 'item1'), {
      itemId: 'item1', folderId: 'folder1', recordId: 'rec1', addedBy: 'user2',
    }));
  });

  it('folder item cannot be updated', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1'), {
        folderId: 'folder1', workspaceId: 'ws-p', name: 'My Folder',
        scope: 'USER', ownerUserId: 'user1',
        createdBy: { actorType: 'USER', actorId: 'user1' },
      });
      await setDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1', 'items', 'item1'), {
        itemId: 'item1', folderId: 'folder1', recordId: 'rec1', addedBy: 'user1',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'folders', 'folder1', 'items', 'item1'), {
      recordId: 'rec-different',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 24. USER RECORD STATE (Step 5)
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/userRecordState/{stateId}', () => {
  it('user can create own record state', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
      stateId: 'user1_rec1', workspaceId: 'ws-p',
      userId: 'user1', recordId: 'rec1', starred: true,
    }));
  });

  it('user cannot create state for another user', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user2_rec1'), {
      stateId: 'user2_rec1', workspaceId: 'ws-p',
      userId: 'user2', recordId: 'rec1', starred: true,
    }));
  });

  it('user can read own record state', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
        stateId: 'user1_rec1', workspaceId: 'ws-p',
        userId: 'user1', recordId: 'rec1', starred: true,
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1')));
  });

  it('user cannot read another user state', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
        stateId: 'user1_rec1', workspaceId: 'ws-p',
        userId: 'user1', recordId: 'rec1', starred: true,
      });
    });
    const db = authedDb('user2');
    await assertFails(getDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1')));
  });

  it('user can update own record state', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
        stateId: 'user1_rec1', workspaceId: 'ws-p',
        userId: 'user1', recordId: 'rec1', starred: false,
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
      starred: true,
    }));
  });

  it('user record state immutable fields protected', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
        stateId: 'user1_rec1', workspaceId: 'ws-p',
        userId: 'user1', recordId: 'rec1', starred: false,
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
      recordId: 'rec-hacked',
    }));
  });

  it('user record state cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1'), {
        stateId: 'user1_rec1', workspaceId: 'ws-p',
        userId: 'user1', recordId: 'rec1', starred: true,
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'userRecordState', 'user1_rec1')));
  });
});

// ═══════════════════════════════════════════════════════
// 25. SHARE TOKENS (Step 5)
// ═══════════════════════════════════════════════════════

describe('workspaces/{wsId}/shareTokens/{tokenId}', () => {
  it('workspace owner can create share token', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
      tokenId: 'tok1', workspaceId: 'ws-p', recordId: 'rec1',
      tokenHash: 'abc123hash', scope: 'READ', status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'user1' },
      maxRedemptions: 1, redemptionCount: 0,
    }));
  });

  it('cannot create share token with spoofed actor', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
      tokenId: 'tok1', workspaceId: 'ws-p', recordId: 'rec1',
      tokenHash: 'abc123hash', scope: 'READ', status: 'ACTIVE',
      createdBy: { actorType: 'USER', actorId: 'someone-else' },
      maxRedemptions: 1, redemptionCount: 0,
    }));
  });

  it('share token immutable fields protected on update', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
        tokenId: 'tok1', workspaceId: 'ws-p', recordId: 'rec1',
        tokenHash: 'abc123hash', scope: 'READ', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user1' },
        maxRedemptions: 1, redemptionCount: 0,
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
      tokenHash: 'hacked-hash',
    }));
  });

  it('share token status update allowed', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
        tokenId: 'tok1', workspaceId: 'ws-p', recordId: 'rec1',
        tokenHash: 'abc123hash', scope: 'READ', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user1' },
        maxRedemptions: 1, redemptionCount: 0,
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
      status: 'REVOKED',
    }));
  });

  it('share token cannot be deleted', async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1'), {
        tokenId: 'tok1', workspaceId: 'ws-p', recordId: 'rec1',
        tokenHash: 'abc123hash', scope: 'READ', status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user1' },
        maxRedemptions: 1, redemptionCount: 0,
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-p', 'shareTokens', 'tok1')));
  });
});

// ═══════════════════════════════════════════════════════
// 26. STEP 5.1 — SUBMITTED RECORD IMMUTABILITY
// ═══════════════════════════════════════════════════════

describe('Step 5.1 — Submitted Record immutability', () => {
  beforeEach(async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
    // Seed a SUBMITTED record
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
        recordId: 'rec-sub', workspaceId: 'ws-p', recordType: 'INVOICE',
        status: 'SUBMITTED', moduleId: 'mod-1', moduleVersion: 2,
        createdBy: { actorType: 'USER', actorId: 'user1' },
        submittedBy: { actorType: 'USER', actorId: 'user1' },
        data: { amount: 100, description: 'Test' },
        entityReferences: [],
        entityReferenceIds: [],
        sourceRequestId: null,
      });
      // Seed a DRAFT record for comparison
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-draft'), {
        recordId: 'rec-draft', workspaceId: 'ws-p', recordType: 'INVOICE',
        status: 'DRAFT', moduleId: 'mod-1', moduleVersion: 2,
        createdBy: { actorType: 'USER', actorId: 'user1' },
        submittedBy: null,
        data: { amount: 0 },
        entityReferences: [],
        entityReferenceIds: [],
        sourceRequestId: null,
      });
    });
  });

  it('data mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      data: { amount: 999, description: 'Hacked' },
    }));
  });

  it('entityReferences mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      entityReferences: [{ entityId: 'fake' }],
    }));
  });

  it('entityReferenceIds mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      entityReferenceIds: ['fake-entity'],
    }));
  });

  it('sourceRequestId mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      sourceRequestId: 'fake-request',
    }));
  });

  it('submittedBy mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      submittedBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });

  it('moduleId mutation denied', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      moduleId: 'mod-hacked',
    }));
  });

  it('moduleVersion mutation denied', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      moduleVersion: 999,
    }));
  });

  it('recordType mutation denied', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      recordType: 'HACKED',
    }));
  });

  it('priority-only update DENIED from browser (Step 15: SET_PRIORITY is trusted-command only)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      priority: 'HIGH',
    }));
  });

  it('status-only update DENIED from browser (Step 15: lifecycle transitions are trusted-command only)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      status: 'ARCHIVED',
    }));
  });

  it('priority + data mutation denied on SUBMITTED record', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      priority: 'HIGH',
      data: { amount: 999 },
    }));
  });

  it('archive field set DENIED from browser (Step 15: ARCHIVE_RECORD is trusted-command only)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-sub'), {
      status: 'ARCHIVED',
      archivedAt: new Date().toISOString(),
      archivedBy: { actorType: 'USER', actorId: 'user1' },
      _previousStatus: 'SUBMITTED',
    }));
  });

  it('DRAFT record data update DENIED from browser (Step 15: trusted UPDATE_DRAFT only)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-draft'), {
      data: { amount: 200, description: 'Updated draft' },
    }));
  });

  it('DRAFT record entityReferences update DENIED from browser (Step 15)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-draft'), {
      entityReferences: [{ entityId: 'ent-1', entityTypeId: 'type-1' }],
    }));
  });

  it('submittedAt impersonation DENIED from browser on DRAFT record (Step 15)', async () => {
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-draft'), {
      status: 'SUBMITTED',
      submittedBy: { actorType: 'USER', actorId: 'attacker' },
      submittedAt: new Date().toISOString(),
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 27. STEP 5.1 — FORM REQUEST COMPLETION RULES
// ═══════════════════════════════════════════════════════

describe('Step 5.1 — Form Request resultRecordId immutability', () => {
  beforeEach(async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1', name: 'My WS' });
  });

  it('resultRecordId can be set when currently null', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod-1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user1', status: 'IN_PROGRESS', resultRecordId: null,
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      status: 'COMPLETED', resultRecordId: 'req_req1',
    }));
  });

  it('resultRecordId cannot be changed once set', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod-1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user1', status: 'COMPLETED', resultRecordId: 'req_req1',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      resultRecordId: 'different-record',
    }));
  });

  it('moduleId immutable on form request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod-1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user1', status: 'IN_PROGRESS', resultRecordId: null,
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      moduleId: 'mod-hacked',
    }));
  });

  it('moduleVersion immutable on form request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod-1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user1', status: 'IN_PROGRESS', resultRecordId: null,
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      moduleVersion: 999,
    }));
  });

  it('recipientUserId immutable on form request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
        requestId: 'req1', workspaceId: 'ws-p', moduleId: 'mod-1', moduleVersion: 1,
        requester: { actorType: 'USER', actorId: 'user1' },
        recipientUserId: 'user1', status: 'IN_PROGRESS', resultRecordId: null,
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'formRequests', 'req1'), {
      recipientUserId: 'hacked-user',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 28. STEP 6 — LEDGER & AUDIT SECURITY
// ═══════════════════════════════════════════════════════

describe('Ledger Book rules', () => {
  beforeEach(async () => {
    await setupWorkspace('org-ws-1', { type: 'ORGANIZATION', organizationId: 'org-1' });
    await setupOrg('org-1', { createdByUserId: 'user1' }, [
      { userId: 'user1', roles: ['OWNER'], status: 'ACTIVE' },
    ]);
  });

  it('allows workspace member to read ledger books', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1'), {
        ledgerBookId: 'lb-1', workspaceId: 'org-ws-1', ledgerCode: 'RI', name: 'Test',
        createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertSucceeds(getDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1')));
  });

  it('denies cross-workspace ledger book read', async () => {
    await setupUser('outsider');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1'), {
        ledgerBookId: 'lb-1', workspaceId: 'org-ws-1', ledgerCode: 'RI', name: 'Test',
        createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1')));
  });

  it('denies client ledger book creation (Step 16: books authored by trusted ledgerCommand)', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-new'), {
      ledgerBookId: 'lb-new', workspaceId: 'org-ws-1', ledgerCode: 'TEST', name: 'Test Book',
      status: 'ACTIVE', blockSize: 100,
      createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'SEQUENTIAL',
    }));
  });

  it('denies ANY client ledger book update (Step 16)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-immut'), {
        ledgerBookId: 'lb-immut', workspaceId: 'org-ws-1', ledgerCode: 'ORIG', name: 'Test',
        createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-immut'), {
      ledgerCode: 'CHANGED',
    }));
  });

  it('denies deleting ledger book', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-del'), {
        ledgerBookId: 'lb-del', workspaceId: 'org-ws-1', ledgerCode: 'DEL', name: 'Del',
        createdBy: { actorType: 'USER', actorId: 'user1' }, numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-del')));
  });
});

describe('Ledger Entry rules', () => {
  beforeEach(async () => {
    await setupWorkspace('org-ws-1', { type: 'ORGANIZATION', organizationId: 'org-1' });
    await setupOrg('org-1', { createdByUserId: 'user1' }, [
      { userId: 'user1', roles: ['OWNER'], status: 'ACTIVE' },
    ]);
    // Seed prerequisite records and books for provenance validation
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1'), {
        ledgerBookId: 'lb-1', workspaceId: 'org-ws-1', ledgerCode: 'RI', name: 'Test',
        status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
        numberingStrategy: 'SEQUENTIAL',
      });
      // Seed records referenced by immutability tests
      const recs = ['rec-1', 'rec-seq', 'rec-ref', 'rec-rid', 'rec-rb', 'rec-cancel', 'rec-del'];
      for (const recId of recs) {
        await setDoc(doc(db, 'workspaces', 'org-ws-1', 'records', recId), {
          recordId: recId, workspaceId: 'org-ws-1', recordType: 'test', status: 'SUBMITTED',
          data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
        });
      }
    });
  });

  it('denies client ledger entry creation (Step 16: entries authored by trusted ledgerCommand)', async () => {
    // Setup: referenced Record and LedgerBook may exist — creation is denied anyway
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'records', 'rec-1'), {
        recordId: 'rec-1', workspaceId: 'org-ws-1', recordType: 'inspection', status: 'SUBMITTED',
        data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-1'), {
        ledgerBookId: 'lb-1', workspaceId: 'org-ws-1', ledgerCode: 'RI', name: 'Test',
        status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
        numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-1'), {
      ledgerEntryId: 'le-1', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
      ledgerBlockId: 'block_1', recordId: 'rec-1', sequenceNumber: 1,
      referenceNumber: 'RI-2026-000001', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
      registeredBy: { actorType: 'USER', actorId: 'user1' },
      _registeredAt: new Date(),
    }));
  });

  it('denies creating entry referencing nonexistent Record', async () => {
    // Setup: only the book exists, no record
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-prov'), {
        ledgerBookId: 'lb-prov', workspaceId: 'org-ws-1', ledgerCode: 'PROV', name: 'Prov',
        status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
        numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-norec'), {
      ledgerEntryId: 'le-norec', workspaceId: 'org-ws-1', ledgerBookId: 'lb-prov',
      ledgerBlockId: 'block_1', recordId: 'nonexistent-record', sequenceNumber: 1,
      referenceNumber: 'PROV-2026-000001', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
      registeredBy: { actorType: 'USER', actorId: 'user1' },
      _registeredAt: new Date(),
    }));
  });

  it('denies creating entry referencing nonexistent LedgerBook', async () => {
    // Setup: only the record exists, no book
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'records', 'rec-nobook'), {
        recordId: 'rec-nobook', workspaceId: 'org-ws-1', recordType: 'test', status: 'SUBMITTED',
        data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-nobook'), {
      ledgerEntryId: 'le-nobook', workspaceId: 'org-ws-1', ledgerBookId: 'nonexistent-book',
      ledgerBlockId: 'block_1', recordId: 'rec-nobook', sequenceNumber: 1,
      referenceNumber: 'X-2026-000001', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
      registeredBy: { actorType: 'USER', actorId: 'user1' },
      _registeredAt: new Date(),
    }));
  });

  it('denies creating entry with non-ACTIVE initial status', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'records', 'rec-badstat'), {
        recordId: 'rec-badstat', workspaceId: 'org-ws-1', recordType: 'test', status: 'SUBMITTED',
        data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
      });
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerBooks', 'lb-badstat'), {
        ledgerBookId: 'lb-badstat', workspaceId: 'org-ws-1', ledgerCode: 'BS', name: 'BadStat',
        status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
        numberingStrategy: 'SEQUENTIAL',
      });
    });
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-badstat'), {
      ledgerEntryId: 'le-badstat', workspaceId: 'org-ws-1', ledgerBookId: 'lb-badstat',
      ledgerBlockId: 'block_1', recordId: 'rec-badstat', sequenceNumber: 1,
      referenceNumber: 'BS-2026-000001', referenceFormatVersion: 1, entryStatus: 'CANCELLED',
      registeredBy: { actorType: 'USER', actorId: 'user1' },
      _registeredAt: new Date(),
    }));
  });

  it('denies mutating sequenceNumber', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-seq'), {
        ledgerEntryId: 'le-seq', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-seq', sequenceNumber: 1,
        referenceNumber: 'RI-2026-000001', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-seq'), {
      sequenceNumber: 99,
    }));
  });

  it('denies mutating referenceNumber', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-ref'), {
        ledgerEntryId: 'le-ref', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-ref', sequenceNumber: 2,
        referenceNumber: 'RI-2026-000002', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-ref'), {
      referenceNumber: 'CHANGED',
    }));
  });

  it('denies mutating recordId', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-rid'), {
        ledgerEntryId: 'le-rid', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-rid', sequenceNumber: 3,
        referenceNumber: 'RI-2026-000003', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-rid'), {
      recordId: 'different-rec',
    }));
  });

  it('denies mutating registeredBy', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-rb'), {
        ledgerEntryId: 'le-rb', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-rb', sequenceNumber: 4,
        referenceNumber: 'RI-2026-000004', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-rb'), {
      registeredBy: { actorType: 'USER', actorId: 'hacker' },
    }));
  });

  it('denies entry status change to CANCELLED from browser (Step 16: cancel requires a trusted command — deferred)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-cancel'), {
        ledgerEntryId: 'le-cancel', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-cancel', sequenceNumber: 5,
        referenceNumber: 'RI-2026-000005', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-cancel'), {
      entryStatus: 'CANCELLED', cancelledAt: '2026-06-01T00:00:00Z',
      cancelledBy: { actorType: 'USER', actorId: 'user1' }, cancellationReason: 'Duplicate',
    }));
  });

  it('denies deleting ledger entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-del'), {
        ledgerEntryId: 'le-del', workspaceId: 'org-ws-1', ledgerBookId: 'lb-1',
        ledgerBlockId: 'block_1', recordId: 'rec-del', sequenceNumber: 6,
        referenceNumber: 'RI-2026-000006', referenceFormatVersion: 1, entryStatus: 'ACTIVE',
        registeredBy: { actorType: 'USER', actorId: 'user1' },
        registeredAt: '2026-01-01T00:00:00Z', _registeredAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerEntries', 'le-del')));
  });
});

describe('Audit Entry rules', () => {
  beforeEach(async () => {
    await setupWorkspace('org-ws-1', { type: 'ORGANIZATION', organizationId: 'org-1' });
    await setupOrg('org-1', { createdByUserId: 'user1' }, [
      { userId: 'user1', roles: ['OWNER'], status: 'ACTIVE' },
    ]);
  });

  it('denies browser audit entry creation (Step 16: evidence is server-authored only)', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-1'), {
      auditEntryId: 'ae-1', workspaceId: 'org-ws-1',
      actor: { actorType: 'USER', actorId: 'user1' },
      action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
      timestamp: '2026-01-01T00:00:00Z', _timestamp: new Date(),
      metadata: {}, source: 'web',
    }));
  });

  it('denies creating audit entry claiming another user', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-spoof'), {
      auditEntryId: 'ae-spoof', workspaceId: 'org-ws-1',
      actor: { actorType: 'USER', actorId: 'otherUser' },
      action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
      timestamp: '2026-01-01T00:00:00Z', metadata: {}, source: 'web',
    }));
  });

  it('denies creating audit entry claiming INTERNAL_AGENT', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-agent'), {
      auditEntryId: 'ae-agent', workspaceId: 'org-ws-1',
      actor: { actorType: 'INTERNAL_AGENT', actorId: 'user1' },
      action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
      timestamp: '2026-01-01T00:00:00Z', metadata: {}, source: 'web',
    }));
  });

  it('denies updating audit entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-upd'), {
        auditEntryId: 'ae-upd', workspaceId: 'org-ws-1',
        actor: { actorType: 'USER', actorId: 'user1' },
        action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
        timestamp: '2026-01-01T00:00:00Z', _timestamp: new Date(),
        metadata: {}, source: 'web',
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-upd'), {
      action: 'record.archived',
    }));
  });

  it('denies deleting audit entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-del'), {
        auditEntryId: 'ae-del', workspaceId: 'org-ws-1',
        actor: { actorType: 'USER', actorId: 'user1' },
        action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
        timestamp: '2026-01-01T00:00:00Z', _timestamp: new Date(),
        metadata: {}, source: 'web',
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-del')));
  });

  it('denies cross-workspace audit read', async () => {
    await setupUser('outsider');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-xws'), {
        auditEntryId: 'ae-xws', workspaceId: 'org-ws-1',
        actor: { actorType: 'USER', actorId: 'user1' },
        action: 'record.created', resourceType: 'RECORD', resourceId: 'rec-1',
        timestamp: '2026-01-01T00:00:00Z', _timestamp: new Date(),
        metadata: {}, source: 'web',
      });
    });
    const db = authedDb('outsider');
    await assertFails(getDoc(doc(db, 'workspaces', 'org-ws-1', 'auditEntries', 'ae-xws')));
  });
});

describe('Ledger Code rules', () => {
  beforeEach(async () => {
    await setupWorkspace('org-ws-1', { type: 'ORGANIZATION', organizationId: 'org-1' });
    await setupOrg('org-1', { createdByUserId: 'user1' }, [
      { userId: 'user1', roles: ['OWNER'], status: 'ACTIVE' },
    ]);
  });

  it('denies client ledger code reservation (Step 16: reservations happen inside trusted CREATE_LEDGER_BOOK)', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerCodes', 'TEST_CODE'), {
      ledgerCode: 'TEST_CODE', workspaceId: 'org-ws-1',
      reservedBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('denies updating ledger code reservation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerCodes', 'IMMUT_CODE'), {
        ledgerCode: 'IMMUT_CODE', workspaceId: 'org-ws-1',
        reservedBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerCodes', 'IMMUT_CODE'), {
      ledgerCode: 'CHANGED',
    }));
  });

  it('denies deleting ledger code reservation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerCodes', 'DEL_CODE'), {
        ledgerCode: 'DEL_CODE', workspaceId: 'org-ws-1',
        reservedBy: { actorType: 'USER', actorId: 'user1' },
      });
    });
    const db = authedDb('user1');
    await assertFails(deleteDoc(doc(db, 'workspaces', 'org-ws-1', 'ledgerCodes', 'DEL_CODE')));
  });
});

describe('Record ledger linkage immutability', () => {
  beforeEach(async () => {
    await setupWorkspace('ws-p', { type: 'PERSONAL', ownerUserId: 'user1' });
    await setupUser('user1');
  });

  it('denies changing ledgerEntryId once set', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-ll'), {
        recordId: 'rec-ll', workspaceId: 'ws-p', recordType: 'test', status: 'SUBMITTED',
        data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
        submittedBy: { actorType: 'USER', actorId: 'user1' },
        moduleId: null, moduleVersion: null, sourceRequestId: null,
        entityReferences: [], entityReferenceIds: [],
        ledgerEntryId: 'le-1', ledgerBookId: 'lb-1', referenceNumber: 'RI-2026-000001',
        _createdAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-ll'), {
      ledgerEntryId: 'le-different',
    }));
  });

  it('denies setting ledger linkage on record from browser (Step 16: linkage is server-owned by ledgerCommand)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-nol'), {
        recordId: 'rec-nol', workspaceId: 'ws-p', recordType: 'test', status: 'SUBMITTED',
        data: {}, createdBy: { actorType: 'USER', actorId: 'user1' },
        submittedBy: { actorType: 'USER', actorId: 'user1' },
        moduleId: null, moduleVersion: null, sourceRequestId: null,
        entityReferences: [], entityReferenceIds: [],
        ledgerEntryId: null, ledgerBookId: null, referenceNumber: null,
        _createdAt: new Date(),
      });
    });
    const db = authedDb('user1');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-p', 'records', 'rec-nol'), {
      ledgerEntryId: 'le-new', ledgerBookId: 'lb-new', referenceNumber: 'RI-2026-000099',
    }));
  });
});

// ═══════════════════════════════════════════════════════
// 29. STEP 7 — WORKSPACE EXPERIENCE SECURITY
// ═══════════════════════════════════════════════════════

describe('Step 7 workspace experience rules', () => {
  beforeEach(async () => {
    await setupWorkspace('ws-step7', { type: 'PERSONAL', ownerUserId: 'user1' });
    await setupWorkspace('ws-other', { type: 'PERSONAL', ownerUserId: 'user2' });
    await setupUser('user1');
    await setupUser('user2');
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'modules', 'mod-report'), {
      moduleId: 'mod-report', workspaceId: 'ws-step7', moduleCode: 'REPORT', name: 'Report Source', status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('allows owner Workset writes and denies cross-workspace writes', async () => {
    const db = authedDb('user1');
    const data = { worksetId: 'w1', workspaceId: 'ws-step7', name: 'Field', moduleIds: [], status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' } };
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-step7', 'worksets', 'w1'), data));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-other', 'worksets', 'w1'), { ...data, workspaceId: 'ws-other' }));
  });

  it('denies Workset actor spoofing', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'worksets', 'spoof'), { worksetId: 'spoof', workspaceId: 'ws-step7', name: 'Field', moduleIds: [], status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user2' } }));
  });

  it('isolates Widgets by owner and workspace', async () => {
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-step7', 'widgetDefinitions', 'wi1'), { widgetId: 'wi1', workspaceId: 'ws-step7', ownerUserId: 'user1', name: 'KPI', type: 'KPI', source: 'RECORDS', status: 'ACTIVE', filters: [], columns: [], display: { limit: 10 }, createdBy: { actorType: 'USER', actorId: 'user1' } }));
    await assertFails(getDoc(doc(authedDb('user2'), 'workspaces', 'ws-step7', 'widgetDefinitions', 'wi1')));
  });

  it('allows Organization OWNER configuration snapshot query but denies ordinary MEMBER all-widget query', async () => {
    await setupWorkspace('ws-widget-org', { type: 'ORGANIZATION', organizationId: 'org-widget' });
    await setupOrg('org-widget', { createdByUserId: 'owner-widget' }, [{ userId: 'owner-widget', roles: ['OWNER'] }, { userId: 'member-widget', roles: ['MEMBER'] }]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-widget-org', 'widgetDefinitions', 'other-widget'), { widgetId: 'other-widget', workspaceId: 'ws-widget-org', ownerUserId: 'another-user', name: 'Shared configuration', type: 'KPI', source: 'RECORDS', status: 'ACTIVE', filters: [], columns: [], display: { limit: 10 }, createdBy: { actorType: 'USER', actorId: 'another-user' } }));
    await assertSucceeds(getDocs(query(collection(authedDb('owner-widget'), 'workspaces', 'ws-widget-org', 'widgetDefinitions'))));
    await assertFails(getDocs(query(collection(authedDb('member-widget'), 'workspaces', 'ws-widget-org', 'widgetDefinitions'))));
  });

  it('denies unsafe or unbounded Widget configuration', async () => {
    const db = authedDb('user1');
    const base = { widgetId: 'unsafe-widget', workspaceId: 'ws-step7', ownerUserId: 'user1', name: 'Unsafe', type: 'KPI', source: 'SECRET', status: 'ACTIVE', filters: [], columns: [], display: { limit: 10 }, createdBy: { actorType: 'USER', actorId: 'user1' } };
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'widgetDefinitions', 'unsafe-widget'), base));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'widgetDefinitions', 'unbounded-widget'), { ...base, widgetId: 'unbounded-widget', source: 'RECORDS', display: { limit: 1000 } }));
  });

  it('Step 17.3 — browsers cannot create Module Categories directly', async () => {
    const db = authedDb('user1');
    const data = { categoryId: 'cat-1', workspaceId: 'ws-step7', displayName: 'Front Office', categoryCode: 'FRONT_OFFICE', description: '', status: 'ACTIVE', sortOrder: 0, createdBy: { actorType: 'USER', actorId: 'user1' } };
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'moduleCategories', 'cat-1'), data));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-other', 'moduleCategories', 'cat-1'), { ...data, workspaceId: 'ws-other', createdBy: { actorType: 'USER', actorId: 'user1' } }));
  });

  it('Step 17.3 — Module Category updates are server-only (identity and code stability)', async () => {
    const db = authedDb('user1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'moduleCategories', 'cat-stable'), { categoryId: 'cat-stable', workspaceId: 'ws-step7', displayName: 'Front Office', categoryCode: 'FRONT_OFFICE', description: '', status: 'ACTIVE', sortOrder: 0, createdBy: { actorType: 'USER', actorId: 'user1' } }));
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-step7', 'moduleCategories', 'cat-stable'), { categoryCode: 'CHANGED' }));
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-step7', 'moduleCategories', 'cat-stable'), { displayName: 'Reception Front Office', updatedAt: '2026-10-04T00:00:00.000Z' }));
  });

  it('isolates personal Module preferences per user — no cross-user mutation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1'), { workspaceId: 'ws-step7', userId: 'user1', moduleSelection: { selectedModuleIds: ['m1'], moduleOrder: ['m1'], viewMode: 'GROUPED' } }));
    await assertSucceeds(getDoc(doc(authedDb('user1'), 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1')));
    await assertFails(getDoc(doc(authedDb('user2'), 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1')));
    await assertFails(updateDoc(doc(authedDb('user2'), 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1'), { moduleSelection: { selectedModuleIds: [], moduleOrder: [], viewMode: 'FLAT' } }));
  });

  it('isolates Notifications to the recipient', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'notifications', 'n1'), { notificationId: 'n1', workspaceId: 'ws-step7', recipientUserId: 'user1', type: 'RECORD_SENT', title: 'Sent', status: 'UNREAD', createdBy: { actorType: 'USER', actorId: 'user2' } }));
    await assertSucceeds(getDoc(doc(authedDb('user1'), 'workspaces', 'ws-step7', 'notifications', 'n1')));
    await assertFails(getDoc(doc(authedDb('user2'), 'workspaces', 'ws-step7', 'notifications', 'n1')));
  });

  it('denies Notification actor spoofing', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'spoof'), {
      notificationId: 'spoof', workspaceId: 'ws-step7', recipientUserId: 'user1',
      type: 'TEST', title: 'Spoof', status: 'UNREAD',
      createdBy: { actorType: 'USER', actorId: 'user2' },
    }));
  });

  // ═══════════════════════════════════════════════════════
  // STEP 17 — trusted Notification boundary
  // ═══════════════════════════════════════════════════════

  it('denies browser Notification creation entirely (Step 17: server functions author notifications)', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-new'), {
      notificationId: 'n-new', workspaceId: 'ws-step7', recipientUserId: 'user1',
      type: 'RECORD_CREATED', title: 'Created', status: 'UNREAD',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });

  it('recipient may flip their own read-state only (status/readAt); no content mutation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'notifications', 'n-own'), {
      notificationId: 'n-own', workspaceId: 'ws-step7', recipientUserId: 'user1',
      type: 'RECORD_CREATED', title: 'Created', status: 'UNREAD',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
    const db = authedDb('user1');
    await assertSucceeds(updateDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-own'), {
      status: 'READ', _readAt: new Date(),
    }));
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-own'), {
      title: 'Forged title',
    }));
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-own'), {
      message: 'forged',
      status: 'READ',
    }));
  });

  it('other users may not flip read-state on someone else Notification', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'ws-step7', 'notifications', 'n-foreign'), {
      notificationId: 'n-foreign', workspaceId: 'ws-step7', recipientUserId: 'user1',
      type: 'RECORD_CREATED', title: 'Created', status: 'UNREAD',
      createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
    const db = authedDb('user2');
    await assertFails(updateDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-foreign'), { status: 'READ' }));
    await assertFails(deleteDoc(doc(db, 'workspaces', 'ws-step7', 'notifications', 'n-foreign')));
  });

  function reportDefinitionData(overrides = {}) {
    return {
      reportId: 'rep-1', workspaceId: 'ws-step7', name: 'Summary', description: '', status: 'ACTIVE', version: 1,
      dataSources: [{ sourceType: 'RECORDS', moduleId: 'mod-report' }], filters: [], groupBy: [],
      metrics: [{ type: 'COUNT', fieldRef: null, key: 'count' }], columns: [], sort: [], visualization: { type: 'TABLE' },
      createdBy: { actorType: 'USER', actorId: 'user1' }, ...overrides,
    };
  }

  it('allows bounded ReportDefinition and denies cross-workspace/spoofed writes', async () => {
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-step7', 'reportDefinitions', 'rep-1'), reportDefinitionData()));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-other', 'reportDefinitions', 'rep-1'), reportDefinitionData({ workspaceId: 'ws-other' })));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'reportDefinitions', 'spoof'), reportDefinitionData({ reportId: 'spoof', createdBy: { actorType: 'USER', actorId: 'user2' } })));
  });

  it('denies unsafe Report sources and unbounded configuration', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'reportDefinitions', 'unsafe'), reportDefinitionData({ reportId: 'unsafe', dataSources: [{ sourceType: 'RECORDS', moduleId: 'mod-report', collectionPath: 'secret' }] })));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'reportDefinitions', 'too-many'), reportDefinitionData({ reportId: 'too-many', filters: Array.from({ length: 11 }, () => ({ operator: 'EQUALS' })) })));
    await assertFails(setDoc(doc(db, 'workspaces', 'ws-step7', 'reportDefinitions', 'missing-module'), reportDefinitionData({ reportId: 'missing-module', dataSources: [{ sourceType: 'RECORDS', moduleId: 'missing' }] })));
  });

  it('allows only preference owner access', async () => {
    const db = authedDb('user1');
    await assertSucceeds(setDoc(doc(db, 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1'), { workspaceId: 'ws-step7', userId: 'user1', activeWorksetId: null }));
    await assertFails(getDoc(doc(authedDb('user2'), 'workspaces', 'ws-step7', 'userWorkspacePreferences', 'user1')));
  });
});

describe('Step 7.2 Chat security rules', () => {
  beforeEach(async () => {
    await setupWorkspace('chat-ws', { type: 'ORGANIZATION', organizationId: 'chat-org' });
    await setupOrg('chat-org', { createdByUserId: 'user1' }, [
      { userId: 'user1', roles: ['OWNER'], status: 'ACTIVE' },
      { userId: 'user2', roles: ['MEMBER'], status: 'ACTIVE' },
      { userId: 'user3', roles: ['MEMBER'], status: 'ACTIVE' },
    ]);
  });

  async function createConversationFixture() {
    // STEP 18: conversations are server-authored. Rules see them only through
    // the trusted chatCommand boundary (simulated by securityRulesDisabled).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const batch = writeBatch(ctx.firestore());
      batch.set(doc(ctx.firestore(), 'workspaces', 'chat-ws', 'conversations', 'c1'), {
        conversationId: 'c1', workspaceId: 'chat-ws', type: 'DIRECT', title: '',
        memberIds: ['user1', 'user2'], status: 'ACTIVE',
        createdBy: { actorType: 'USER', actorId: 'user1' }, _createdAt: new Date(), _updatedAt: new Date(),
      });
      for (const userId of ['user1', 'user2']) {
        batch.set(doc(ctx.firestore(), 'workspaces', 'chat-ws', 'conversations', 'c1', 'members', userId), {
          conversationId: 'c1', workspaceId: 'chat-ws', userId, role: userId === 'user1' ? 'OWNER' : 'MEMBER',
        });
      }
      await batch.commit();
    });
  }

  it('allows members to read but NOT write messages directly (trusted boundary)', async () => {
    await createConversationFixture();
    await assertSucceeds(getDoc(doc(authedDb('user2'), 'workspaces', 'chat-ws', 'conversations', 'c1')));
    await assertFails(getDoc(doc(authedDb('user3'), 'workspaces', 'chat-ws', 'conversations', 'c1')));
    // Direct browser message create is denied for everyone (trusted chatCommand only).
    await assertFails(setDoc(doc(authedDb('user2'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm1'), {
      messageId: 'm1', conversationId: 'c1', workspaceId: 'chat-ws', senderUserId: 'user2', content: 'Hello', _createdAt: new Date(),
    }));
    await assertFails(setDoc(doc(authedDb('user3'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm2'), {
      messageId: 'm2', conversationId: 'c1', workspaceId: 'chat-ws', senderUserId: 'user3', content: 'Blocked', _createdAt: new Date(),
    }));
    // Messages can be READ by members.
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm9'), { messageId: 'm9', conversationId: 'c1', workspaceId: 'chat-ws', senderUserId: 'user1', content: 'Hi' }));
    await assertSucceeds(getDoc(doc(authedDb('user2'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm9')));
    await assertFails(getDoc(doc(authedDb('user3'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm9')));
  });

  it('denies sender identity spoofing and message mutation', async () => {
    await createConversationFixture();
    const ref = doc(authedDb('user2'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'm1');
    await assertFails(setDoc(ref, { messageId: 'm1', conversationId: 'c1', workspaceId: 'chat-ws', senderUserId: 'user1', content: 'Spoof' }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'locked'), { messageId: 'locked', conversationId: 'c1', workspaceId: 'chat-ws', senderUserId: 'user1', content: 'Original' }));
    await assertFails(updateDoc(doc(authedDb('user1'), 'workspaces', 'chat-ws', 'conversations', 'c1', 'messages', 'locked'), { content: 'Changed' }));
  });

  it('denies cross-workspace conversation provenance', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaces', 'chat-ws', 'conversations', 'bad'), {
      conversationId: 'bad', workspaceId: 'other-ws', type: 'GROUP', memberIds: ['user1'], status: 'ACTIVE', createdBy: { actorType: 'USER', actorId: 'user1' },
    }));
  });
});

describe('Workspace reset trusted boundary rules', () => {
  it('denies browser access to reset locks and surviving reset audits', async () => {
    const db = authedDb('user1');
    await assertFails(setDoc(doc(db, 'workspaceResetOperations', 'ws1'), { status: 'RUNNING', requestedBy: 'user1' }));
    await assertFails(getDoc(doc(db, 'workspaceResetOperations', 'ws1')));
    await assertFails(setDoc(doc(db, 'workspaceResetAudits', 'audit1'), { workspaceId: 'ws1', result: 'SUCCESS' }));
    await assertFails(getDoc(doc(db, 'workspaceResetAudits', 'audit1')));
  });
});

describe('workspaces/{wsId}/automatPlans/{planId}', () => {
  async function seedPlan() {
    await setupWorkspace('ws-automat', { type: 'PERSONAL', ownerUserId: 'owner1', name: 'Automat' });
    await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'workspaces', 'ws-automat', 'automatPlans', 'plan1'), { planId: 'plan1', workspaceId: 'ws-automat', status: 'READY_FOR_REVIEW' }));
  }

  it('Workspace owner can read trusted plan', async () => {
    await seedPlan();
    await assertSucceeds(getDoc(doc(authedDb('owner1'), 'workspaces', 'ws-automat', 'automatPlans', 'plan1')));
  });

  it('other user and unauthenticated caller cannot read plan', async () => {
    await seedPlan();
    await assertFails(getDoc(doc(authedDb('other'), 'workspaces', 'ws-automat', 'automatPlans', 'plan1')));
    await assertFails(getDoc(doc(unauthedDb(), 'workspaces', 'ws-automat', 'automatPlans', 'plan1')));
  });

  it('browser cannot create, forge lifecycle, delete, or access trusted operations/audits', async () => {
    await seedPlan();
    const ref = doc(authedDb('owner1'), 'workspaces', 'ws-automat', 'automatPlans', 'plan1');
    await assertFails(setDoc(doc(authedDb('owner1'), 'workspaces', 'ws-automat', 'automatPlans', 'plan2'), { planId: 'plan2', workspaceId: 'ws-automat', status: 'APPLIED' }));
    await assertFails(updateDoc(ref, { status: 'APPLIED', approvedBy: 'owner1' }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(authedDb('owner1'), 'workspaceAutomatOperations', 'ws-automat')));
    await assertFails(getDoc(doc(authedDb('owner1'), 'automatApplyOperations', 'operation1')));
    await assertFails(getDoc(doc(authedDb('owner1'), 'automatApplyAudits', 'operation1')));
  });
});

// ═══════════════════════════════════════════════════════
// 30. DENY BY DEFAULT
// ═══════════════════════════════════════════════════════

describe('deny-by-default', () => {
  it('authenticated user cannot access unknown collection', async () => {
    const db = authedDb('user1');
    await assertFails(getDoc(doc(db, 'secretCollection', 'doc1')));
  });

  it('unauthenticated cannot access anything', async () => {
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'organizations', 'org1')));
    await assertFails(getDoc(doc(db, 'workspaces', 'ws1')));
    await assertFails(getDoc(doc(db, 'users', 'user1')));
  });
});
