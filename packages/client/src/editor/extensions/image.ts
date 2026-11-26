/**
 * Image blocks. The node's `src` is `asset:<id>` (stored with the session); the
 * view resolves it to a URL the browser can load. Uploads show a placeholder with
 * a local preview at the drop point until the server has the asset, then the real
 * node replaces it.
 *
 * The placeholder plugin is adapted from steven-tey/novel
 * (packages/headless/src/plugins/upload-images.tsx, Apache-2.0).
 */
import Image, { type ImageOptions } from "@tiptap/extension-image";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface EdwImageOptions extends ImageOptions {
  resolveAssetUrl: (src: string) => string;
}

export const EdwImage = Image.extend<EdwImageOptions>({
  addOptions() {
    return { ...this.parent?.(), resolveAssetUrl: (src: string) => src } as EdwImageOptions;
  },

  addNodeView() {
    const resolve = () => this.options.resolveAssetUrl;
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.className = "blk-image";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.draggable = false;
      const cap = document.createElement("figcaption");
      dom.append(img, cap);
      let current = node;
      const render = (n: Node) => {
        img.src = resolve()((n.attrs.src as string | null) ?? "");
        img.alt = (n.attrs.alt as string | null) ?? "";
        cap.textContent = img.alt;
        cap.hidden = !img.alt;
      };
      render(node);
      return {
        dom,
        update(n: Node) {
          if (n.type !== current.type) return false;
          current = n;
          render(n);
          return true;
        },
        selectNode: () => dom.classList.add("is-selected"),
        deselectNode: () => dom.classList.remove("is-selected"),
        ignoreMutation: () => true,
      };
    };
  },
});

/* ------------------------------------------------------------ uploads */

const uploadKey = new PluginKey<DecorationSet>("edw-image-upload");

export const UploadPlaceholderPlugin = () =>
  new Plugin<DecorationSet>({
    key: uploadKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        set = set.map(tr.mapping, tr.doc);
        const action = tr.getMeta(uploadKey) as { add?: { id: object; pos: number; src: string }; remove?: { id: object } } | undefined;
        if (action?.add) {
          const { id, pos, src } = action.add;
          const placeholder = document.createElement("figure");
          placeholder.className = "blk-image img-placeholder";
          const image = document.createElement("img");
          image.src = src;
          image.alt = "";
          placeholder.appendChild(image);
          set = set.add(tr.doc, [Decoration.widget(pos, placeholder, { id })]);
        } else if (action?.remove) {
          set = set.remove(set.find(undefined, undefined, (spec) => spec.id === action.remove!.id));
        }
        return set;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state) ?? null;
      },
    },
  });

function findPlaceholder(state: EditorState, id: object): number | null {
  const decos = uploadKey.getState(state);
  const found = decos?.find(undefined, undefined, (spec) => spec.id === id) ?? [];
  return found.length ? found[0]!.from : null;
}

/** Position just after the top-level block containing `pos` (or `pos` itself at depth 0). */
export function blockBoundaryAfter(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(pos);
  return $pos.depth === 0 ? pos : $pos.after(1);
}

export type UploadImage = (file: File) => Promise<{ asset_id: string }>;

/** Show a placeholder at `pos`, upload, then put the real image block there. */
export function startImageUpload(view: EditorView, pos: number, file: File, upload: UploadImage, onError: (err: unknown) => void = () => undefined): void {
  const id = {};
  const at = blockBoundaryAfter(view.state, pos);
  const reader = new FileReader();
  reader.onload = () => {
    if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(uploadKey, { add: { id, pos: at, src: reader.result } }));
  };
  reader.readAsDataURL(file);
  const alt = file.name.replace(/\.[a-z0-9]+$/i, "");
  upload(file).then(
    ({ asset_id }) => {
      if (view.isDestroyed) return;
      const where = findPlaceholder(view.state, id);
      const node = view.state.schema.nodes.image!.create({ src: `asset:${asset_id}`, alt });
      const tr = view.state.tr.setMeta(uploadKey, { remove: { id } });
      view.dispatch(tr.insert(where ?? blockBoundaryAfter(view.state, view.state.selection.from), node));
    },
    (err: unknown) => {
      if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(uploadKey, { remove: { id } }));
      onError(err);
    },
  );
}

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

export function imageFileFrom(items: FileList | null | undefined): File | null {
  if (!items) return null;
  for (const f of Array.from(items)) if (IMAGE_MIMES.includes(f.type)) return f;
  return null;
}
