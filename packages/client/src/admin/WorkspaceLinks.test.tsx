import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLinks } from './WorkspaceLinks';

afterEach(cleanup);

describe('WorkspaceLinks', () => {
  it('offers a link workspace its link to open and to copy, and no make kit link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<WorkspaceLinks url="https://edw.example/s/tok123" />);
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('https://edw.example/s/tok123');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://edw.example/s/tok123'));
    expect(screen.queryByText('Signs in')).toBeNull();
  });

  it('says an account workspace signs in, with no links', () => {
    render(<WorkspaceLinks url={null} />);
    expect(screen.getByText('Signs in')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
