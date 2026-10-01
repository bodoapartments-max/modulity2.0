import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App shell', () => {
  it('renders the Modulity 2.0 scaffold', () => {
    render(<App />);
    expect(screen.getByText('Modulity 2.0')).toBeInTheDocument();
    expect(screen.getByText(/Step 0 complete/)).toBeInTheDocument();
  });
});
