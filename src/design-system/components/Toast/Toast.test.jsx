import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ToastProvider, { useToast } from './ToastProvider.jsx';

function Trigger({ message }) {
  const { showToast } = useToast();
  return <button type="button" onClick={() => showToast({ message, variant: 'success' })}>Show</button>;
}

describe('ToastProvider', () => {
  it('shows a toast message', () => {
    render(<ToastProvider><Trigger message="Saved" /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('removes toast when closed', () => {
    render(<ToastProvider><Trigger message="Saved" /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('auto-dismisses after timeout', async () => {
    render(<ToastProvider autoClose={100}><Trigger message="Saved" /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
