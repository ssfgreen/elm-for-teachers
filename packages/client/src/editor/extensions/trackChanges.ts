/**
 * The assistant's suggestions drawn as tracked changes, as in a word processor:
 *  - a suggested change to a block shows the words it adds underlined in the suggestion
 *    colour, and the words it takes out struck through just after them (a widget, not part of
 *    the document, so the text the teacher edits is the suggested text);
 *  - a new block is underlined throughout and a block to delete struck through (CSS on the
 *    status classes from blockChrome.ts).
 * How they look depends on the mode under the chat box (editor/suggestions.css): Suggesting hides
 * the struck words, leaving a thin mark (`sg-del-only`) where words go with nothing in their place.
 * Deciding happens on the suggestion's card in the comments column. A click on a suggestion in
 * the text dispatches `SUGGESTION_SELECT` (a DOM event that bubbles, with the block id, and the
 * change's number when the click was on one) so the screen can open the column and pick out
 * its card.
 */
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { TYPE_FOR_NODE } from "../blockTypes.js";
import { changeIndexes, diffWords } from "@edw/shared";
import { flatText, plainTextOf } from "../suggest/text.js";

export const SUGGESTION_SELECT = "edw-suggestion-select";
/** `part`: the change clicked on, numbered as its card (data-suggest-part); null for the block. */
export type SuggestionSelectEvent = CustomEvent<{ block_id: string; part: number | null }>;

export const trackChangesKey = new PluginKey<DecorationSet>("edw-track-changes");

/** A mark relative to its block's start, kept per node so unchanged blocks are not diffed again. */
/** `part` is the change's number in its block, as on its card (suggest/suggestions.ts). */
/** `alone`: a change that only takes words out, with nothing put in their place. */
type Rel = { kind: "ins"; from: number; to: number; part: number } | { kind: "del"; at: number; text: string; part: number; alone: boolean };
const cache = new WeakMap<Node, Rel[]>();

export const TrackChanges = Extension.create({
  name: "edwTrackChanges",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: trackChangesKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => trackChangesKey.getState(state),
          handleClick(view, pos, event) {
            const doc = view.state.doc;
            const index = doc.resolve(Math.min(pos, doc.content.size)).index(0);
            const node = index < doc.childCount ? doc.child(index) : null;
            const id = node?.attrs.id as string | null | undefined;
            if (node && id && isSuggestion(node)) view.dom.dispatchEvent(new CustomEvent(SUGGESTION_SELECT, { bubbles: true, detail: { block_id: id, part: partAt(event.target, id) } }));
            return false;
          },
        },
      }),
    ];
  },
});

/** The number of the change a click landed on, if it was on one of this block's changes. */
function partAt(target: EventTarget | null, blockId: string): number | null {
  const el = target instanceof Element ? target.closest<HTMLElement>("[data-suggest-part]") : null;
  if (!el || el.dataset.suggestFor !== blockId) return null;
  const n = Number(el.dataset.suggestPart);
  return Number.isInteger(n) ? n : null;
}

export const isSuggestion = (n: Node) => (n.attrs.status ?? "live") === "proposed" || !!n.attrs.pending;

function build(doc: Node): DecorationSet {
  const decos: Decoration[] = [];
  doc.forEach((node, pos) => {
    const pending = node.attrs.pending as { op: string } | null;
    const original = node.attrs.original as string | null;
    if (pending?.op !== "replace" || original === null) return;
    const id = (node.attrs.id as string | null) ?? "";
    for (const r of marksOf(node, original)) {
      if (r.kind === "ins") decos.push(Decoration.inline(pos + r.from, pos + r.to, { class: "sg-ins", "data-suggest-for": id, "data-suggest-part": String(r.part) }));
      else
        decos.push(
          Decoration.widget(pos + r.at, () => deleted(r.text, id, r.part, r.alone), {
            side: -1,
            marks: [],
            ignoreSelection: true,
            key: `sg-del|${id}|${r.part}|${r.at}|${r.alone}|${r.text}`,
          }),
        );
    }
  });
  return DecorationSet.create(doc, decos);
}

function marksOf(node: Node, original: string): Rel[] {
  const hit = cache.get(node);
  if (hit) return hit;
  const type = TYPE_FOR_NODE[node.type.name];
  const now = flatText(node);
  const rels: Rel[] = [];
  if (type) {
    let offset = 0;
    const parts = diffWords(plainTextOf(node.type.schema, type, original), now.text);
    const index = changeIndexes(parts);
    const adds = new Set(parts.flatMap((p, k) => (p.kind === "ins" ? [index[k]!] : [])));
    parts.forEach((p, k) => {
      const part = index[k]!;
      if (p.kind === "del") {
        rels.push({ kind: "del", at: offset < now.text.length ? now.pos[offset]! : now.end, text: p.text, part, alone: !adds.has(part) });
        return;
      }
      if (p.kind === "ins") rels.push({ kind: "ins", from: now.pos[offset]!, to: now.pos[offset + p.text.length - 1]! + 1, part });
      offset += p.text.length;
    });
  }
  cache.set(node, rels);
  return rels;
}

function deleted(text: string, blockId: string, part: number, alone: boolean): HTMLElement {
  const el = document.createElement("del");
  el.className = alone ? "sg-del sg-del-only" : "sg-del";
  el.title = `Taken out: ${text.trim()}`;
  el.contentEditable = "false";
  el.dataset.suggestFor = blockId;
  el.dataset.suggestPart = String(part);
  // A line break taken out shows as a pilcrow, so the change is not invisible.
  el.textContent = text.replace(/\n/g, " ¶ ");
  return el;
}
