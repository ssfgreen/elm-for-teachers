import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Editor } from '@tiptap/core';
import { DocStyleControls } from './DocStyleControls';
import { buildExtensions } from './extensions/index';
import { serializeInline } from './inline';
import { pageStyle } from './docStyle';

afterEach(cleanup);

describe('DocStyleControls', () => {
  it('sets the font, each named in its own font, keeping the page colour', () => {
    const onChange = vi.fn();
    render(<DocStyleControls style={{ background: 'cream' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Document font: Calibri' }));
    const menu = screen.getByRole('menu', { name: 'Document font' });
    const lexend = within(menu).getByRole('menuitemradio', { name: 'Lexend' });
    expect(lexend.style.fontFamily).toContain('Lexend');
    fireEvent.click(lexend);
    expect(onChange).toHaveBeenLastCalledWith({ font: 'lexend', background: 'cream' });
    expect(screen.queryByRole('menu', { name: 'Document font' })).toBeNull();
  });

  it('a doc with no font is in Calibri: the menu says so, with no separate Default, and Calibri keeps it unset', () => {
    const onChange = vi.fn();
    render(<DocStyleControls style={{ background: 'cream' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Document font: Calibri' }));
    const menu = screen.getByRole('menu', { name: 'Document font' });
    expect(within(menu).queryByRole('menuitemradio', { name: /Default/ })).toBeNull();
    expect(within(menu).getAllByRole('menuitemradio').filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)).toEqual(['Calibri']);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Calibri' }));
    expect(onChange).toHaveBeenLastCalledWith({ background: 'cream' });
  });

  it('lists four Sans and three Serif fonts under their headings, and keeps an old font while in use', () => {
    render(<DocStyleControls style={{ font: 'verdana' }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Document font: Verdana' }));
    const menu = screen.getByRole('menu', { name: 'Document font' });
    const names = (g: string) => within(within(menu).getByRole('group', { name: g })).getAllByRole('menuitemradio').map((b) => b.textContent);
    expect(names('Sans')).toEqual(['Lexend', 'Calibri', 'Arial', 'OpenDyslexic', 'Verdana']);
    expect(names('Serif')).toEqual(['Georgia', 'Cambria', 'Times New Roman']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Verdana' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Georgia' }).style.fontFamily).toContain('Gelasio');
    expect(within(menu).getByRole('menuitemradio', { name: 'OpenDyslexic' }).style.fontFamily).toContain('OpenDyslexic');
  });

  it('no longer offers Comic Sans (a past study condition), but keeps it listed for a doc set in it', () => {
    render(<DocStyleControls style={{ font: 'comic_sans' }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Document font: Comic Sans' }));
    const sans = within(within(screen.getByRole('menu', { name: 'Document font' })).getByRole('group', { name: 'Sans' })).getAllByRole('menuitemradio');
    expect(sans.map((b) => b.textContent)).toEqual(['Lexend', 'Calibri', 'Arial', 'OpenDyslexic', 'Comic Sans']);
    expect(sans[4]!.style.fontFamily).toContain('Comic Neue');
  });

  it('with text selected, sets that text\'s font over the document\'s, and the document\'s font gives it back', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: '<p>Her voice was like silk.</p>' });
    const onChange = vi.fn();
    const para = () => serializeInline(editor.state.doc.firstChild!);
    render(<DocStyleControls style={{ font: 'lexend' }} editor={editor} onChange={onChange} />);
    // Nothing selected: the document's font.
    expect(screen.getByRole('button', { name: 'Document font: Lexend' })).toBeTruthy();
    // "voice" selected.
    act(() => void editor.commands.setTextSelection({ from: 5, to: 10 }));
    fireEvent.click(screen.getByRole('button', { name: 'Font for the selection: Document’s font' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Font for the selection' })).getByRole('menuitemradio', { name: 'Georgia' }));
    expect(para()).toBe('Her <span data-font="georgia">voice</span> was like silk.');
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.view.dom.querySelector('span[data-font="georgia"]')!.getAttribute('style')).toContain('Gelasio');
    fireEvent.click(screen.getByRole('button', { name: 'Font for the selection: Georgia' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Document’s font' }));
    expect(para()).toBe('Her voice was like silk.');
    editor.destroy();
  });

  it('sets the page colour, and White takes it off', () => {
    const onChange = vi.fn();
    render(<DocStyleControls style={{ font: 'arial', background: 'blue' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page colour: Pale blue' }));
    const menu = screen.getByRole('menu', { name: 'Page colour' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Pale blue' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'White' }));
    expect(onChange).toHaveBeenLastCalledWith({ font: 'arial' });
  });

  it("draws the page in the doc's font and colour, in Calibri when it has none (as Word prints it)", () => {
    expect(pageStyle(undefined)).toEqual({ fontFamily: 'Calibri, Carlito, sans-serif' });
    expect(pageStyle({ font: 'comic_sans', background: 'lilac' })).toEqual({ fontFamily: expect.stringContaining('Comic Sans MS'), backgroundColor: 'var(--paper-lilac)' });
  });
});
