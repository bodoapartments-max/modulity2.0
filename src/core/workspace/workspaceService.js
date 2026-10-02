/**
 * Modulity 2.0 — Workspace Application Service
 *
 * Handles workspace creation, retrieval, and personal workspace initialization.
 * React-independent: can be consumed by web UI, mobile, agents, or API.
 */

import { createWorkspace, WORKSPACE_TYPES } from './workspace.js';
import { createPerson } from './person.js';
import { eventBus, createEvent } from '../events/eventBus.js';

export function personalWorkspaceId(userId) {
  return `personal_${userId}`;
}

async function traceBootstrapOperation(_label, operation) {
  return operation();
}

/**
 * Creates a WorkspaceService.
 *
 * @param {Object} deps
 * @param {import('./workspaceRepository.js').WorkspaceRepository} deps.workspaceRepo
 * @param {import('./personRepository.js').PersonRepository} deps.personRepo
 * @returns {Object}
 */
export function createWorkspaceService({ workspaceRepo, personRepo }) {
  /**
   * Ensures a personal workspace exists for the given user.
   * Idempotent — returns existing workspace if already created.
   *
   * @param {Object} user — { userId, email, displayName }
   * @returns {Promise<import('./workspace.js').Workspace>}
   */
  async function ensurePersonalWorkspace(user) {
    const existing = await traceBootstrapOperation(
      'personal workspace lookup',
      () => workspaceRepo.getPersonalWorkspace(user.userId),
    );
    if (existing) return existing;

    const workspace = createWorkspace({
      workspaceId: personalWorkspaceId(user.userId),
      type: WORKSPACE_TYPES.PERSONAL,
      name: `${user.displayName || user.email}'s Workspace`,
      ownerUserId: user.userId,
      organizationId: null,
    });

    const created = await traceBootstrapOperation(
      'personal workspace creation',
      () => workspaceRepo.create(workspace),
    );

    eventBus.emit(createEvent({
      eventType: 'workspace.created',
      workspaceId: created.workspaceId,
      actor: { type: 'user', id: user.userId },
      payload: { workspaceId: created.workspaceId, type: WORKSPACE_TYPES.PERSONAL },
    }));

    return created;
  }

  /**
   * Ensures the user's Person/Profile document exists.
   * Idempotent — returns existing profile if already created.
   *
   * @param {Object} user — { userId, email, displayName }
   * @returns {Promise<import('./person.js').Person>}
   */
  async function ensurePersonProfile(user) {
    const existing = await traceBootstrapOperation(
      'Person profile lookup',
      () => personRepo.getByUserId(user.userId),
    );
    if (existing) return existing;

    const person = createPerson({
      userId: user.userId,
      displayName: user.displayName || user.email,
      email: user.email,
    });

    return traceBootstrapOperation('Person profile creation', () => personRepo.create(person));
  }

  /**
   * Initializes workspace context for a user on first login.
   * Creates personal workspace and person profile if they don't exist.
   *
   * @param {Object} user
   * @returns {Promise<{ workspace: Workspace, person: Person }>}
   */
  async function initializeUserWorkspace(user) {
    const [workspace, person] = await Promise.all([
      ensurePersonalWorkspace(user),
      ensurePersonProfile(user),
    ]);

    return { workspace, person };
  }

  /**
   * Gets all workspaces accessible to a user.
   * Includes personal workspace and organization workspaces via membership.
   *
   * @param {string} userId
   * @param {import('./membershipRepository.js').MembershipRepository} membershipRepo
   * @returns {Promise<Workspace[]>}
   */
  async function getAccessibleWorkspaces(userId, membershipRepo) {
    const [personalWorkspaces, memberships] = await Promise.all([
      workspaceRepo.getWorkspacesForUser(userId),
      membershipRepo.getByUser(userId),
    ]);

    const orgWorkspacePromises = memberships
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => workspaceRepo.getByOrganizationId(m.organizationId));

    const orgWorkspaces = (await Promise.all(orgWorkspacePromises)).filter(Boolean);

    return [...personalWorkspaces, ...orgWorkspaces];
  }

  return {
    ensurePersonalWorkspace,
    ensurePersonProfile,
    initializeUserWorkspace,
    getAccessibleWorkspaces,
  };
}
