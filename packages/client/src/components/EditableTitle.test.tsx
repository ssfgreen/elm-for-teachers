import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableTitle } from './EditableTitle';

afterEach(cleanup);

function setup() {
  const onRename = vi.fn();
  render(<EditableTitle itemKey="1" value="Untitled" onRename={onRename} as="h2" className="t" inputClassName="i" inputLabel="Name" maxLength={20} />);
  return { onRename, title: () => screen.getByRole('heading', { name: 'Untitled' }) };
}

describe('EditableTitle', () => {
  it('has no pencil button, and renames on a double-click', () => {
    const { onRename, title } = setup();
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.doubleClick(title());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'P01' } });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('P01');
  });

  it('renames from the keyboard with Enter or F2 on the focused title', () => {
    const { title } = setup();
    expect(title().tabIndex).toBe(0);
    fireEvent.keyDown(title(), { key: 'F2' });
    expect(screen.getByLabelText('Name')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    fireEvent.keyDown(title(), { key: 'Enter' });
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });
});
