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
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  setLogLevel,
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
// 10. DENY BY DEFAULT
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
