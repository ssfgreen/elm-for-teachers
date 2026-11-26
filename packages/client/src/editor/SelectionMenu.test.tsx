import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import { SelectionMenu } from './SelectionMenu';
import { buildExtensions } from './extensions/index';
import { serializeInline } from './inline';
import { nodeToContent } from './markdown';
import { installEditorPolyfills } from '../test-utils';

installEditorPolyfills();
afterEach(cleanup);

describe('SelectionMenu', () => {
  it('sets the selected text\'s font from the bubble', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = new Editor({ element: host, extensions: buildExtensions(), content: '<p>Her voice was like silk.</p>' });
    const marks = { bold: false, italic: false, underline: false, code: false };
    render(<SelectionMenu editor={editor} marks={marks} onMark={vi.fn()} />);
    act(() => void editor.chain().focus().setTextSelection({ from: 5, to: 10 }).run());
    expect(await screen.findByRole('button', { name: /^Bold/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Font for the selection: Document’s font' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Font for the selection' })).getByRole('menuitemradio', { name: 'Lexend' }));
    expect(serializeInline(editor.state.doc.firstChild!)).toBe('Her <span data-font="lexend">voice</span> was like silk.');
    editor.destroy();
    host.remove();
  });
  it('colours the header row of a table from the bubble, and offers it only in a table', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const editor = new Editor({
      element: host,
      extensions: buildExtensions(),
      content: '<p>Before the table</p><table><tr><th><p>Word</p></th><th><p>Type</p></th></tr><tr><td><p>silk</p></td><td><p>simile</p></td></tr></table>',
    });
    const marks = { bold: false, italic: false, underline: false, code: false };
    render(<SelectionMenu editor={editor} marks={marks} onMark={vi.fn()} />);
    act(() => void editor.chain().focus().setTextSelection({ from: 2, to: 8 }).run());
    expect(await screen.findByRole('button', { name: /^Bold/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Header row colour/ })).toBeNull();
    let silk = 0;
    editor.state.doc.descendants((n, p) => {
      if (n.isText && n.text === 'silk') silk = p;
    });
    act(() => void editor.chain().focus().setTextSelection({ from: silk, to: silk + 4 }).run());
    fireEvent.click(await screen.findByRole('button', { name: 'Header row colour' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Header row colour' })).getByRole('menuitemradio', { name: 'Teal' }));
    expect(nodeToContent(editor.state.doc.child(1)).content).toBe('| Word | Type |\n| --- | --- |\n| silk | simile |\n<!-- header: teal -->');
    expect(screen.getByRole('button', { name: 'Header row colour: Teal' })).toBeTruthy();
    editor.destroy();
    host.remove();
  });
});
