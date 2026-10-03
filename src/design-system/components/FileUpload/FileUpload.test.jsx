import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FileUpload from './FileUpload.jsx';

function getFileInput(container) {
  return container.querySelector('input[type="file"]');
}

describe('FileUpload', () => {
  it('calls onChange with selected files', () => {
    const onChange = vi.fn();
    const { container } = render(<FileUpload id="files" onChange={onChange} />);
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    fireEvent.change(getFileInput(container), { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith({ files: [file] });
  });

  it('enforces maxFiles', () => {
    const onChange = vi.fn();
    const { container } = render(<FileUpload id="files" multiple maxFiles={1} onChange={onChange} />);
    const a = new File(['a'], 'a.txt');
    const b = new File(['b'], 'b.txt');
    fireEvent.change(getFileInput(container), { target: { files: [a, b] } });
    expect(onChange).toHaveBeenCalledWith({ files: [], error: 'Maximum 1 file(s) allowed.' });
  });

  it('removes selected files', () => {
    const onChange = vi.fn();
    const file = new File(['x'], 'x.txt');
    render(<FileUpload id="files" files={[file]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(onChange).toHaveBeenCalledWith({ files: [] });
  });
});
