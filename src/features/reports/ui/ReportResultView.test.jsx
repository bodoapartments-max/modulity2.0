import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReportResultView from './ReportResultView.jsx';

describe('ReportResultView', () => {
  it('renders deterministic summary, groups, rows and explicit truncation', () => {
    render(<ReportResultView result={{
      definition: { columns: [{ scope: 'DATA', field: 'amount', label: 'Amount' }] },
      summary: { record_count: 3, total: 400 },
      groups: [{ key: 'Hotel', count: 1, metrics: { total: 300 } }, { key: 'Other', count: 2, metrics: { total: 100 } }],
      rows: [{ recordId: 'r1', values: { amount: 300 } }], totalMatched: 3, truncated: true,
    }} />);
    expect(screen.getByText('400')).toBeInTheDocument();
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText(/Showing the first 1 of 3/)).toBeInTheDocument();
  });
});
