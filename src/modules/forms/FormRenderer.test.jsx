import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormRenderer } from './FormRenderer.jsx';

const schema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
  ],
};

function renderForm(props = {}) {
  const onSubmit = vi.fn();
  const onValuesChange = vi.fn();
  render(
    <FormRenderer
      schema={schema}
      workspaceId="ws-1"
      submitLabel="Submit"
      onSubmit={onSubmit}
      onValuesChange={onValuesChange}
      {...props}
    />,
  );
  return { onSubmit, onValuesChange };
}

describe('FormRenderer onValuesChange', () => {
  it('notifies after value changes but not on mount', () => {
    const { onValuesChange } = renderForm({ initialValues: { title: 'Initial' } });
    expect(onValuesChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Initial 2' } });
    expect(onValuesChange).toHaveBeenCalled();
    expect(onValuesChange.mock.calls.at(-1)[0]).toEqual({ title: 'Initial 2' });
  });
});

describe('FormRenderer validateOnSubmit', () => {
  it('validates by default and blocks submit on missing required field', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/fix the errors above/i)).toBeInTheDocument();
  });

  it('skips schema validation when validateOnSubmit is false (draft editing)', () => {
    const { onSubmit } = renderForm({ validateOnSubmit: false });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
