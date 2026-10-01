import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Drawer from './Drawer.jsx';

describe('Drawer', () => {
  it('renders children when open', () => {
    render(
      <Drawer open onClose={vi.fn()}>
        <p>Drawer content</p>
      </Drawer>,
    );

    expect(screen.getByText('Drawer content')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Drawer open={false} onClose={vi.fn()}>
        <p>Drawer content</p>
      </Drawer>,
    );

    expect(screen.queryByText('Drawer content')).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Drawer open onClose={handleClose}>
        <p>Drawer content</p>
      </Drawer>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
