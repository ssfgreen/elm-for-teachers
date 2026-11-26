/**
 * Preferences: the teacher's settings for the workspace. A note about themselves, which the
 * assistant reads in every chat (after its system prompt), and the font new documents start in.
 * Each change is saved at once and logged on the server (preferences_set).
 */
import { useEffect, useState } from 'react';
import { DEFAULT_DOC_FONT, TEACHER_NOTE_MAX, type DocFont, type Preferences } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { SavedText } from '../../components/SavedText';
import { fieldClass } from '../../components/ui/input';
import { DOC_FONT_GROUPS, DOC_FONT_LABELS, DOC_FONT_STACKS } from '../../editor/docStyle';
import { cn } from '../../lib/utils';
import { UsageSection } from './UsageSection';

const sectionClass = 'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card';
const noteClass = cn(fieldClass, 'w-full resize-none text-md');

export function PreferencesScreen({ api, getEnvelope }: { api: SessionApi; getEnvelope: () => Envelope }) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPreferences?.()
      .then((p) => !cancelled && setPrefs(p))
      .catch(() => !cancelled && setFailed('Your preferences could not be loaded. Please reload the page.'));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const saveNote = async (teacher_note: string | null) => {
    const saved = await api.setPreferences!({ teacher_note }, getEnvelope());
    setPrefs(saved);
  };

  const setFont = (default_font: DocFont | null) => {
    const before = prefs;
    setFailed(null);
    setPrefs((p) => (p ? { ...p, default_font } : p));
    api
      .setPreferences?.({ default_font }, getEnvelope())
      .then(setPrefs)
      .catch(() => {
        setPrefs(before);
        setFailed('That change could not be saved. Please try again.');
      });
  };

  return (
    <div className="min-w-0 flex-1 overflow-y-auto bg-background" data-make-part="preferences">
      <div className="mx-auto flex max-w-200 flex-col gap-5 px-6 py-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="m-0 text-3xl leading-tight font-semibold">Preferences</h1>
          <p className="m-0 text-md text-foreground-2">Settings for all your chats. Changes are saved as you make them.</p>
        </header>
        {failed && (
          <p className="error-text" role="alert">
            {failed}
          </p>
        )}
        {prefs === null && !failed && <p className="m-0 text-md text-muted-foreground">Loading…</p>}
        {prefs && (
          <>
            <section className={sectionClass} aria-labelledby="pref-about">
              <div className="flex flex-col gap-1">
                <h2 id="pref-about" className="m-0 text-base font-semibold">
                  About you
                </h2>
                <p className="m-0 text-sm text-muted-foreground">
                  The assistant reads this in every chat. Say what you teach and who you teach, and how you like to work. A project’s instructions and what you ask in a chat come first.
                </p>
              </div>
              <SavedText
                label="About you"
                className={noteClass}
                placeholder="For example: I teach P5 in Glasgow. Several of my class have dyslexia. I like short sentences and British spelling."
                value={prefs.teacher_note}
                maxLength={TEACHER_NOTE_MAX}
                onSave={saveNote}
                boxed
              />
            </section>
            <section className={sectionClass} aria-labelledby="pref-font">
              <div className="flex flex-col gap-1">
                <h2 id="pref-font" className="m-0 text-base font-semibold">
                  Default font
                </h2>
                <p className="m-0 text-sm text-muted-foreground">New documents start in this font. Documents you already have keep theirs; change one from its toolbar.</p>
              </div>
              <FontChoice font={prefs.default_font} onPick={setFont} />
            </section>
            <UsageSection api={api} className={sectionClass} />
          </>
        )}
      </div>
    </div>
  );
}

/** Calibri is what a doc with no font is in already, so choosing it clears the preference. */
function FontChoice({ font, onPick }: { font: DocFont | null; onPick: (font: DocFont | null) => void }) {
  const shown = font ?? DEFAULT_DOC_FONT;
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Default font</legend>
      {DOC_FONT_GROUPS.map((g) => (
        <div key={g.label} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</span>
          <div className="flex flex-wrap gap-2">
            {g.fonts.map((f) => (
              <label
                key={f}
                className={cn(
                  'cursor-pointer rounded-md border border-border px-3 py-1.5 text-md text-foreground-2 hover:bg-hover has-focus-visible:outline-2 has-focus-visible:outline-ring',
                  shown === f && 'border-border-strong bg-pressed text-foreground',
                )}
                style={{ fontFamily: DOC_FONT_STACKS[f] }}
              >
                <input type="radio" className="sr-only" name="default-font" checked={shown === f} onChange={() => onPick(f === DEFAULT_DOC_FONT ? null : f)} />
                {DOC_FONT_LABELS[f]}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
