/**
 * The make kit's place inside the worksheet ("In the document"): a ProseMirror widget after the
 * first table (or the third block), so a card can sit between the worksheet's parts, where a
 * change it is about would be. The widget's element is made once and the place is drawn into it
 * with a portal; ProseMirror leaves what happens inside a widget alone. Outside the make kit
 * there is no widget.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { MakeSlot, useInMakeKit } from './slots';

const KEY = new PluginKey('make-inline');

/** Where the place goes: after the first table, or after the third block. */
export function inlineSlotPos(doc: Node): number | null {
  if (!doc.childCount) return null;
  let table = -1;
  doc.forEach((n, _o, i) => {
    if (table < 0 && n.type.name === 'table') table = i;
  });
  const after = table >= 0 ? table : Math.min(2, doc.childCount - 1);
  let pos = 0;
  for (let i = 0; i <= after; i++) pos += doc.child(i).nodeSize;
  return pos;
}

export function useInlineSlot(editor: Editor | null): ReactNode {
  const inKit = useInMakeKit();
  const el = useMemo(() => {
    if (!inKit || typeof document === 'undefined') return null;
    const div = document.createElement('div');
    div.className = 'make-inline';
    return div;
  }, [inKit]);
  useEffect(() => {
    if (!editor || !el || editor.isDestroyed) return;
    const plugin = new Plugin({
      key: KEY,
      props: {
        decorations(state) {
          const pos = inlineSlotPos(state.doc);
          if (pos === null) return null;
          return DecorationSet.create(state.doc, [Decoration.widget(pos, el, { key: 'make-inline', side: -1, ignoreSelection: true, stopEvent: () => true })]);
        },
      },
    });
    editor.registerPlugin(plugin);
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(KEY);
    };
  }, [editor, el]);
  return el ? createPortal(<MakeSlot zone="inline" />, el) : null;
}
