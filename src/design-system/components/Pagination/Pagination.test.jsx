import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Pagination from './Pagination.jsx';

describe('Pagination', () => {
  it('disables previous on first page', () => {
    render(<Pagination currentPage={1} hasPrevious={false} hasNext onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables next when no next page', () => {
    render(<Pagination currentPage={3} hasPrevious hasNext={false} onPrevious={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPrevious and onNext', () => {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(<Pagination currentPage={2} hasPrevious hasNext onPrevious={onPrevious} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('renders custom pageInfo', () => {
    render(<Pagination currentPage={1} pageInfo="Records 1-10" hasPrevious hasNext onNext={() => {}} />);
    expect(screen.getByText('Records 1-10')).toBeInTheDocument();
  });
});
