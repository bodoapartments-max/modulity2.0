import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Input from './Input.jsx';

describe('Input', () => {
  it('renders an input with provided attributes', () => {
    render(<Input placeholder="Enter email" type="email" />);

    const input = screen.getByPlaceholderText(/Enter email/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
  });

  it('marks input as invalid when error is provided', () => {
    render(<Input error="Required" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
