import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Textarea from './Textarea.jsx';

describe('Textarea', () => {
  it('renders label and value', () => {
    render(<Textarea label="Note" value="hello" onChange={() => {}} />);
    expect(screen.getByLabelText(/Note/i)).toHaveValue('hello');
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<Textarea value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('respects disabled and required', () => {
    render(<Textarea label="Note" value="" disabled required onChange={() => {}} />);
    const textarea = screen.getByLabelText(/Note/i);
    expect(textarea).toBeDisabled();
    expect(textarea).toBeRequired();
  });

  it('shows helper text and error', () => {
    render(<Textarea label="Note" value="" helperText="Hint" error="Required" onChange={() => {}} />);
    expect(screen.getByText('Hint')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });
});
