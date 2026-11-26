import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import { TextSizeMenu } from './TextSizeMenu';
import { buildExtensions } from './extensions/index';
import { serializeInline } from './inline';

afterEach(cleanup);

describe('TextSizeMenu', () => {
  it('sets the selected text in a size, drawn in points, and Normal gives it back the block\'s size', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: '<p>Her voice was like silk.</p>' });
    const para = () => serializeInline(editor.state.doc.firstChild!);
    render(<TextSizeMenu editor={editor} />);
    act(() => void editor.commands.setTextSelection({ from: 5, to: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'Text size: Normal' }));
    const menu = screen.getByRole('menu', { name: 'Text size' });
    expect(within(menu).getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Small', 'Normal', 'Large', 'Extra large', 'Huge']);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Large' }));
    expect(para()).toBe('Her <span data-size="large">voice</span> was like silk.');
    expect(screen.queryByRole('menu', { name: 'Text size' })).toBeNull();
    expect(editor.view.dom.querySelector('span[data-size="large"]')!.getAttribute('style')).toContain('font-size: 14pt');
    fireEvent.click(screen.getByRole('button', { name: 'Text size: Large' }));
    expect(screen.getByRole('menuitemradio', { name: 'Large' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Normal' }));
    expect(para()).toBe('Her voice was like silk.');
    editor.destroy();
  });
});
