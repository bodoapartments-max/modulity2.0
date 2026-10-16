/**
 * ActionCard component tests (Step 31)
 * Reusable generic card: renders closed decide actions, busy state,
 * keyboard-compatible controls.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionCard from './ActionCard.jsx';

const card = {
  actionCardId: 'ac_1',
  type: 'APPROVAL',
  title: 'Expense approval',
  summary: 'Please review €482.20',
  priority: 'HIGH',
  dueAt: '2026-10-20T18:00:00.000Z',
  actions: [
    { type: 'APPROVAL_DECIDE', approvalCaseId: 'appr_1', decision: 'APPROVE' },
    { type: 'APPROVAL_DECIDE', approvalCaseId: 'appr_1', decision: 'REJECT' },
    { type: 'VIEW_SUBJECT', subject: { type: 'RECORD', id: 'r1' } },
  ],
};

describe('ActionCard', () => {
  it('renders title, summary, due date and high-priority badge', () => {
    render(<ActionCard card={card} />);
    expect(screen.getByRole('heading', { name: /Expense approval/i })).toBeInTheDocument();
    expect(screen.getByText(/482.20/)).toBeInTheDocument();
    expect(screen.getByText(/High priority/i)).toBeInTheDocument();
    expect(screen.getByText(/Due /i)).toBeInTheDocument();
  });

  it('renders closed decide actions and forwards them', () => {
    const onAction = vi.fn();
    render(<ActionCard card={card} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onAction).toHaveBeenCalledWith(card, expect.objectContaining({ decision: 'APPROVE' }));

    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    expect(onAction).toHaveBeenCalledWith(card, expect.objectContaining({ decision: 'REJECT' }));
  });

  it('does not render navigation-only actions as buttons', () => {
    render(<ActionCard card={card} />);
    expect(screen.queryByRole('button', { name: /VIEW_SUBJECT/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('disables controls while busy (double-click safe affordance)', () => {
    render(<ActionCard card={card} busy />);
    for (const btn of screen.getAllByRole('button')) expect(btn).toBeDisabled();
  });

  it('has an accessible label', () => {
    render(<ActionCard card={card} />);
    expect(screen.getByRole('article', { name: /Expense approval/i })).toBeInTheDocument();
  });

  it('renders no action row when only non-executable actions exist', () => {
    const readOnly = { ...card, actions: [{ type: 'VIEW_SUBJECT', subject: null }] };
    render(<ActionCard card={readOnly} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
