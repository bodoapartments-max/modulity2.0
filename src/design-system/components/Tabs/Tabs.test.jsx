import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Tabs from './Tabs.jsx';

const tabs = [
  { key: 'one', label: 'One', content: <div>Panel One</div> },
  { key: 'two', label: 'Two', content: <div>Panel Two</div> },
  { key: 'three', label: 'Three', disabled: true, content: <div>Panel Three</div> },
];

describe('Tabs', () => {
  it('renders tabs and shows active panel', () => {
    render(<Tabs tabs={tabs} activeTab="one" />);
    expect(screen.getByRole('tab', { name: 'One', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Panel One')).toBeInTheDocument();
  });

  it('switches tab on click', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} activeTab="one" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(onChange).toHaveBeenCalledWith('two');
  });

  it('disables a tab', () => {
    render(<Tabs tabs={tabs} activeTab="one" />);
    expect(screen.getByRole('tab', { name: 'Three' })).toBeDisabled();
  });

  it('supports keyboard navigation', () => {
    render(<Tabs tabs={tabs} />);
    const tabOne = screen.getByRole('tab', { name: 'One' });
    tabOne.focus();
    fireEvent.keyDown(tabOne, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Two', selected: true })).toBeInTheDocument();
  });
});
