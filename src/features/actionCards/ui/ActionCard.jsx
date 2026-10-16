/**
 * ActionCard — reusable presentation for a canonical ActionCard projection.
 *
 * Generic across card types; the closed `actions[]` registry is rendered as
 * buttons that map to canonical trusted operations. Contains no business
 * rules — decision authority stays with the approvalCommand boundary.
 */
import { Button } from '../../../design-system/index.js';

const ACTION_LABELS = {
  APPROVE: 'Approve',
  REJECT: 'Reject',
};

export default function ActionCard({ card, busy = false, onAction, footer = null }) {
  const decideActions = (card.actions || []).filter((a) => a.type === 'APPROVAL_DECIDE');
  return (
    <article
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
      aria-label={card.title}
      data-card-type={card.type}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{card.type.toLowerCase()}</p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-neutral-900">{card.title}</h3>
        </div>
        {card.priority === 'HIGH' && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            High priority
          </span>
        )}
      </header>
      {card.summary && (
        <p className="mt-2 text-sm text-neutral-600 line-clamp-2">{card.summary}</p>
      )}
      {card.dueAt && (
        <p className="mt-1 text-xs text-neutral-500">
          Due {new Date(card.dueAt).toLocaleString()}
        </p>
      )}
      {footer}
      {decideActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {decideActions.map((action) => (
            <Button
              key={`${card.actionCardId}_${action.decision}`}
              type="button"
              size="sm"
              variant={action.decision === 'APPROVE' ? 'primary' : 'ghost'}
              disabled={busy}
              onClick={() => onAction?.(card, action)}
            >
              {ACTION_LABELS[action.decision] || action.decision}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}
