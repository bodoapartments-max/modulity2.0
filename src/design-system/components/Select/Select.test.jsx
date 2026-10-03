import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Select from './Select.jsx';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('Select', () => {
  it('renders options and label', () => {
    render(<Select label="Choose" options={options} value="" onChange={() => {}} />);
    expect(screen.getByLabelText(/Choose/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
  });

  it('calls onChange with selected value', () => {
    const onChange = vi.fn();
    render(<Select label="Choose" options={options} value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Choose/i), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows placeholder when provided', () => {
    render(<Select options={options} value="" placeholder="Pick one" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: 'Pick one' })).toHaveAttribute('value', '');
  });

  it('is disabled and required when configured', () => {
    render(<Select label="Choose" options={options} value="" disabled required onChange={() => {}} />);
    const select = screen.getByLabelText(/Choose/i);
    expect(select).toBeDisabled();
    expect(select).toBeRequired();
  });

  it('shows error and helper text', () => {
    render(<Select label="Choose" options={options} value="" error="Bad choice" helperText="Hint" onChange={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad choice');
    expect(screen.getByText('Hint')).toBeInTheDocument();
  });
});
