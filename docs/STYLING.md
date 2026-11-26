# Styling

The client uses **Tailwind CSS v4** with one theme file and a few shared components in
**shadcn/ui**'s form. Light and dark follow the system setting unless the person picks one
in the account menu.

## Where things are

| File | What it holds |
|---|---|
| `packages/client/src/styles/theme.css` | Every colour, radius and shadow, in light and dark. Start here. (The front page's own radii `rounded-2xl`/`3xl` and shadows `shadow-soft`/`dot` are in `screens/landing/landing.css`'s `@theme`; see "The front page" below.) |
| `packages/client/src/styles/base.css` | What elements look like before any class (page font, scrollbars, headings, bare buttons and fields). |
| `packages/client/src/styles/index.css` | The entry: imports the rest in order. |
| `packages/client/src/editor/canvas.css` | The document's content (ProseMirror): headings, lists, tables, suggestion marks. Stays as CSS, since the editor draws that HTML, not React. |
| `packages/client/src/components/chat.css`, `splitter.css` | Markdown replies, the writing dots' animation, and the cursor while dragging the splitter. |
| `packages/client/src/components/wordPreview.css` | The Word preview's pages, drawn by docx-preview. Outside any layer, since docx-preview's own styles are. |
| `packages/client/src/components/ui/` | Shared pieces: `Button`, `Input`, `Textarea`, `Badge`, `FileTile`. |
| `packages/client/src/theme.ts` | The Light / Dark / System choice. |

## Rules

1. **Style a component in its own file, with utilities.** Use the theme's names only:
   - surfaces: `bg-background`, `bg-panel`, `bg-card`, `bg-composer`, `bg-popover`
   - text: `text-foreground`, `text-foreground-2`, `text-muted-foreground`
   - lines and fills: `border-border`, `border-border-strong`, `bg-hover`, `bg-pressed`, `ring-ring`
   - accent: `bg-primary`, `text-primary`, `bg-primary-soft`, `text-primary-foreground`, `hover:bg-primary-hover`
   - states: `destructive`, `success`, `warning` (each with `-soft` and `-border`), `proposal…`, `user-msg…`, `mark…`, `model`
   - shape: `rounded-xs` (4px), `rounded-sm` (6px), `rounded-md` (10px), `rounded-lg` (16px), `shadow-card`, `shadow-float`, `shadow-pop`, `shadow-raised`, `font-mono`

   Tailwind's own palette (`red-500` and so on) is switched off, and hex or `rgb()` values
   are not used. A new colour goes into `theme.css`, with a light and a dark value.
2. **Use the scale, not bracketed values.** The theme sets Tailwind's scale to the app's
   sizes, so classes name a step: `text-xs` (12px), `text-sm` (13px), `text-md` (14px),
   `text-base` (15px, most of the interface), `text-lg` (16px, reading text); spacing in
   0.25 steps (`p-1.5` is 6px, `h-7.5` is 30px); `rounded-xs/sm/md/lg`; `max-md:` for the
   narrow layout. Write `text-sm`, never `text-[13px]`. If a size is missing, add it to
   `theme.css` rather than to a class. The only bracketed classes left are the ones that
   are not sizes: `content-[attr(data-tip)]` and `data-[active=true]:`.
3. **Use `components/ui`** for buttons (`<Button variant="primary|ghost|link|toolbar|bar…">`)
   and fields (`Input`, `Textarea`). Join classes with `cn()` from `lib/utils`.
4. **Keep a plain class name only as a hook**, where code or tests find the element by it
   (`querySelector('.chat-title')`, `closest('.doc-panel')`) or where `canvas.css` targets
   it. Put the hook first: `className={cn('chat-title', 'truncate text-sm …')}`.
5. **States come from attributes**: `data-[active=true]:bg-pressed`, `aria-expanded:bg-hover`,
   `aria-selected:`, `disabled:`. Parent hover is `group` / `group-hover:`.
6. **Media queries**: `max-md:` (720px) for the narrow layout, `max-lg:` (900px) to drop side
   columns, `touch:` for devices without hover.
   A page that sits beside the workspace's sidebar drops its side column by its own width: mark
   it `@container` and use `@max-[62rem]:` (the class page, `ClassPage.tsx`).
7. **What stays CSS**: HTML that React does not draw (the document's content, Markdown
   replies), keyframes, scrollbar pseudo-elements, and rules that cross components with
   `:has()`. Keep these in `@layer components`.
8. Dark mode comes from the tokens; reach for `dark:` only when a token cannot do it.

## The front page

`/` and `/start` (`screens/landing/`) have a look of their own: warm paper, large type with an
italic serif half in each title, an ink button, and a soft stage behind the editor drawing.

- **Colours** are tokens in `theme.css` like any other, with a light and a dark value:
  `bg-landing-page`, `landing-stage` (the stage's glows), `bg-landing-ink` and its
  `text-landing-ink-*` (the dark band) and `bg-landing-button` (the ink button). Use them only
  on these two pages.
- **Sizes, radii and motion** are in `screens/landing/landing.css`, since nothing else uses
  them: `text-display`, `text-title`, `text-lead`, `font-display` (Lexend) and
  `font-accent` (Gelasio italic, both already bundled for documents), `rounded-2xl` and
  `rounded-3xl`, `shadow-soft` and `shadow-dot`, the `landing-stage` and `ruled` utilities, and
  the hero's entrance (`landing-word`, `landing-rise`), which rests under reduced motion.
- A title's italic half is an `<em>` inside `.landing-title` (the `Title` component).
  `lib/utils.ts` tells tailwind-merge that `text-display`, `text-title` and `text-lead`
  are sizes and `shadow-soft` and `shadow-dot` are shadows, so `cn()` keeps them.
- The ink button (`MainAction.tsx`) is written out on a `Link`, not a `Button` variant:
  `Button`'s hover styles use `hover:enabled:`, which never matches an `<a>`.
- The words are in `screens/landing/content.ts`: every claim there comes from the docs, so
  change one only when the tool changes.
