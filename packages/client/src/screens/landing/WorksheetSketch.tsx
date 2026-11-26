import { Check, Telescope, X } from 'lucide-react';

/**
 * The editor drawn in markup, so it follows the theme: the chat (a request, the reply and its
 * Spyglass note) beside the document, where the suggestion waits. Below 720px the chat column
 * goes and the document stays. Screen readers get the label only.
 */
export function WorksheetSketch() {
  return (
    <div
      role="img"
      aria-label="The editor: a teacher asks for clearer wording, and the change waits in the worksheet to be accepted or rejected."
      className="overflow-hidden rounded-2xl border border-border bg-panel shadow-soft"
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm">
          <span className="truncate text-foreground">The water cycle</span>
          <span className="rounded-xs bg-primary-soft px-1.5 py-0.5 text-xs text-primary">Suggesting</span>
        </div>
        <div className="flex">
          <div className="flex w-56 shrink-0 flex-col gap-3 border-r border-border p-3 text-sm max-md:hidden">
            <p className="ml-6 rounded-md bg-user-msg px-3 py-2 text-user-msg-foreground">Make question 2 clearer for P5.</p>
            <p className="text-foreground-2">I reworded question 2. Accept or reject it in the document.</p>
            <div className="rounded-md border border-proposal-border bg-proposal p-2.5 text-xs text-proposal-foreground">
              <p className="flex items-center gap-1 font-semibold">
                <Telescope className="size-3.5" /> Spyglass
              </p>
              <p className="mt-1">Only question 2 changed, as asked.</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 bg-background p-4">
            <div className="rounded-md border border-border bg-card p-5 shadow-card">
              <p className="font-display text-xl text-foreground">The water cycle</p>
              <p className="mt-1 text-xs text-foreground-2">P5 · Science · Name: __________</p>
              <div className="ruled mt-4 flex flex-col text-sm leading-6.5 text-foreground-2">
                <p>1. Water in the sea is warmed by the sun.</p>
                <p>
                  2. It rises as{' '}
                  <span className="rounded-xs bg-suggest-soft px-0.5 text-suggest underline decoration-suggest underline-offset-2">
                    water vapour, a gas you cannot see
                  </span>
                  .
                </p>
                <p>3. High up, the vapour cools and makes clouds.</p>
                <p>4. Draw an arrow for each step.</p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-primary-foreground">
                  <Check className="size-3.5" /> Accept
                </span>
                <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong px-2 py-1 text-foreground-2">
                  <X className="size-3.5" /> Reject
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
