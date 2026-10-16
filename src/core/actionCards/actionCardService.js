/**
 * Modulity 2.0 — Action Card Read Service (Step 31)
 *
 * Read-side surface for the ActionCard projection. Cards are derived
 * operational read-models produced by trusted command engines; this
 * service exposes bounded per-user queries. No writes.
 *
 * @module core/actionCards/actionCardService
 */

export function createActionCardService({ actionCardRepo }) {
  /** OPEN cards addressed to a user — the "things awaiting me" surface. */
  async function listOpenCardsForUser(workspaceId, userId) {
    return actionCardRepo.listOpenByAudience(workspaceId, userId);
  }

  return Object.freeze({ listOpenCardsForUser });
}
