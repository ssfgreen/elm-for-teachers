/**
 * The teacher's prompt library for the pupil reader (#177): the buttons pupils will be offered,
 * each with the hidden instruction that goes to the assistant, and where it is offered. Nothing
 * reaches pupils yet; choosing prompts for a reading comes later. The logic is in usePromptLibrary.ts.
 */
import type { Envelope } from '../../../api/types';
import type { PromptLibraryApi } from './api';
import { PromptCard } from './PromptCard';
import { EMPTY_PROMPT, PromptForm } from './PromptForm';
import { usePromptLibrary } from './usePromptLibrary';

export function PromptLibraryScreen({ api, getEnvelope }: { api: PromptLibraryApi; getEnvelope: () => Envelope }) {
  const lib = usePromptLibrary(api, getEnvelope);

  return (
    <div className="mx-auto flex max-w-200 flex-col gap-5 px-6 py-10">
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-3xl leading-tight font-semibold">Prompt library</h1>
        <p className="m-0 text-md text-foreground-2">
          The buttons pupils can press when reading. Each sends your instruction to the assistant, with the text they are reading and anything they highlighted. Pupils see only the button.
        </p>
      </header>
      {lib.status === 'loading' && <p className="m-0 text-md text-muted-foreground">Loading…</p>}
      {lib.status === 'failed' && (
        <p className="error-text m-0" role="alert">
          The prompt library could not be loaded. Please reload the page.
        </p>
      )}
      {lib.error && (
        <p className="error-text m-0" role="alert">
          {lib.error}
        </p>
      )}
      {lib.status === 'ready' && (
        <>
          {lib.prompts.length === 0 ? (
            <p className="m-0 text-md text-muted-foreground">No prompts yet. Add one below.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Prompts">
              {lib.prompts.map((p, i) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  first={i === 0}
                  last={i === lib.prompts.length - 1}
                  busy={{ after_highlight: lib.saving(p.id, 'after_highlight'), follow_up: lib.saving(p.id, 'follow_up') }}
                  onSave={(patch) => lib.save(p.id, patch)}
                  onRemove={() => void lib.remove(p.id)}
                  onMove={(by) => void lib.move(p.id, by)}
                />
              ))}
            </ol>
          )}
          <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-4" aria-labelledby="add-prompt-heading">
            <h2 id="add-prompt-heading" className="m-0 text-lg font-semibold">
              Add a prompt
            </h2>
            <PromptForm start={EMPTY_PROMPT} submitLabel="Add prompt" withTicks onSubmit={lib.add} />
          </section>
        </>
      )}
    </div>
  );
}
