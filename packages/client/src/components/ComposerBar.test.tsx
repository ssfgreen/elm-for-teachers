import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposerBar } from './ComposerBar';

afterEach(cleanup);

const MODELS = [
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', group: 'OpenAI', reasoning: true },
  { id: 'gpt-5.5', label: 'GPT-5.5', group: 'OpenAI', reasoning: true },
  { id: 'gpt-4.1', label: 'GPT-4.1', group: 'Open models', reasoning: false },
];

describe('ComposerBar', () => {
  it('shows the model and effort, and picks another model or effort from its menu', () => {
    const onModelChange = vi.fn();
    render(<ComposerBar models={MODELS} model="gpt-6-sol" effort="medium" onModelChange={onModelChange} />);
    const picker = screen.getByRole('button', { name: 'Model: GPT-6 Sol Medium' });
    fireEvent.click(picker);
    const menu = screen.getByRole('menu', { name: 'Model' });
    expect(within(menu).getByText('OpenAI')).toBeTruthy();
    expect(within(menu).getByText('Open models')).toBeTruthy();
    expect(within(menu).getAllByRole('menuitemradio').map((m) => m.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'true', 'false']);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /^High/ }));
    expect(onModelChange).toHaveBeenLastCalledWith('gpt-6-sol', 'high');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /GPT-5\.5/ }));
    expect(onModelChange).toHaveBeenLastCalledWith('gpt-5.5', 'medium');
  });

  it('shows no effort for a model without reasoning, and no picker with only one model', () => {
    const { unmount } = render(<ComposerBar models={MODELS} model="gpt-4.1" effort="high" onModelChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Model: GPT-4.1' }));
    expect(screen.queryByText('Thinking')).toBeNull();
    unmount();
    render(<ComposerBar models={MODELS.slice(0, 1)} model="gpt-6-sol" onModelChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Model/ })).toBeNull();
  });

  it('shows whether the assistant suggests or edits, and switches it from its menu', () => {
    const onEditModeChange = vi.fn();
    render(<ComposerBar editMode="suggest" onEditModeChange={onEditModeChange} />);
    const button = screen.getByRole('button', { name: 'Assistant: Suggesting' });
    // Closed, it is the mode's icon only, named on hover.
    expect(button.querySelectorAll('svg')).toHaveLength(1);
    expect(button.textContent).toBe('');
    expect(button.getAttribute('data-tip')).toBe('Suggesting: you accept or reject each change; new words show in green');
    fireEvent.click(button);
    const menu = screen.getByRole('menu', { name: 'Assistant’s changes'.replace('’', "'") });
    expect(within(menu).getAllByRole('menuitemradio').map((m) => [m.textContent, m.getAttribute('aria-checked')])).toEqual([
      ['EditingChanges go straight into the document', 'false'],
      ['SuggestingYou accept or reject each change; new words show in green', 'true'],
      ['Track changesAs Suggesting, with the words taken out struck through', 'false'],
    ]);
    // Open, each mode has its icon.
    expect(within(menu).getAllByRole('menuitemradio').map((m) => m.querySelectorAll('svg').length)).toEqual([1, 2, 1]);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /^Editing/ }));
    expect(onEditModeChange).toHaveBeenCalledWith('edit');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Track changes/ }));
    expect(onEditModeChange).toHaveBeenLastCalledWith('track');
  });

  it('"+" picks files to add as context', () => {
    const onAddFiles = vi.fn();
    render(<ComposerBar onAddFiles={onAddFiles} />);
    expect(screen.getByRole('button', { name: 'Add files' })).toBeTruthy();
    const input = screen.getByLabelText('Files to add') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.pdf');
    expect(input.accept).toContain('.pptx');
    const a = new File(['x'], 'Curriculum.pdf');
    const b = new File(['y'], 'Slides.pptx');
    fireEvent.change(input, { target: { files: [a, b] } });
    expect(onAddFiles).toHaveBeenCalledWith([a, b]);
  });
});
