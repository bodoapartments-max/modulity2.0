/**
 * Action Cards feature model (Step 31)
 *
 * Orchestrates the ActionCard projection reads and the closed decision
 * actions rendered on cards. All mutations flow through the trusted
 * approvalCommand boundary; card state stays a derived projection.
 */

/**
 * Loads OPEN Action Cards addressed to a user.
 * @returns {Promise<Array>} cards
 */
export async function loadOpenActionCards({ actionCardService, workspaceId, userId }) {
  return actionCardService.listOpenCardsForUser(workspaceId, userId);
}

/**
 * Executes a closed card action. Only APPROVAL_DECIDE is executable —
 * VIEW_SUBJECT is navigation handled by the UI.
 * `operationId` must be generated once per user intent (double-click safe:
 * the same operationId replays the journal instead of duplicating effects).
 */
export async function executeCardAction({ approvalCommand, workspaceId, action, operationId }) {
  if (action.type !== 'APPROVAL_DECIDE') {
    throw new Error(`Unsupported card action: ${action.type}`);
  }
  return approvalCommand.decideApproval({
    workspaceId,
    approvalCaseId: action.approvalCaseId,
    decision: action.decision,
    operationId,
  });
}
