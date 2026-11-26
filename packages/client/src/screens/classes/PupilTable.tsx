/**
 * A class's pupils: one row a pupil, each cell saved when it loses focus. A new
 * pupil gets a number in the class and a made-up label (the server makes both); the dice deals
 * another label. A label that looks
 * like a name is flagged. Rows can move to another class, or be removed when a pupil leaves.
 * Needs and Working at are not shown or sent (#243): the teacher writes what matters in the note.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dices, Plus, Trash2 } from 'lucide-react';
import { makePupilLabel, PUPIL_LABEL_MAX, PUPIL_TEXT_MAX, type ClassSummary, type Pupil, type PupilAdaptation } from '@edw/shared';
import { AdaptationsCell } from './AdaptationsCell';
import { usePupilAdaptations } from './usePupilAdaptations';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { autoGrow } from '../../components/autoGrow';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { withAdded } from '../../state/classDetail';
import { useClassDetail } from '../../state/useClassDetail';
import { cellChange, cellText, looksLikeName, type PupilColumn } from './pupilFields';
import { cardTitleClass, fieldClass, hintClass } from './styles';

export interface PupilTableProps {
  classId: string;
  otherClasses: ClassSummary[];
  api: SessionApi;
  getEnvelope: () => Envelope;
  /** After a change, so the class list's counts follow. */
  onChanged: () => void;
}

const NO_ADAPTATIONS: PupilAdaptation[] = [];

/** `wide`: free text that wraps and grows, rather than one line. */
const COLUMNS: { key: Exclude<PupilColumn, 'label'>; title: string; wide?: boolean }[] = [
  { key: 'helps', title: 'What helps', wide: true },
  { key: 'note', title: 'Note', wide: true },
];

export function PupilTable({ classId, otherClasses, api, getEnvelope, onChanged }: PupilTableProps) {
  const [saveFailed, setFailed] = useState<string | null>(null);
  // The one copy of the class: the open chat's mentions and the sidebar read the same rows.
  const { detail, failed: loadFailed, update, refreshOther } = useClassDetail(api, classId);
  const pupils = detail?.pupils ?? null;
  const failed = saveFailed ?? (loadFailed ? 'The pupils could not be loaded. Please reload the page.' : null);
  const setPupils = (change: (ps: Pupil[]) => Pupil[]) => update((d) => ({ ...d, pupils: change(d.pupils) }));
  const setChosen = useCallback((change: (xs: PupilAdaptation[]) => PupilAdaptation[]) => update((d) => ({ ...d, adaptations: change(d.adaptations ?? []) })), [update]);
  const adapt = usePupilAdaptations({ api, classId, getEnvelope, onFail: setFailed, chosen: detail?.adaptations ?? NO_ADAPTATIONS, setChosen });

  const run = async (what: string, fn: () => Promise<void>) => {
    setFailed(null);
    try {
      await fn();
      onChanged();
    } catch {
      setFailed(`${what} did not work. Please try again.`);
    }
  };
  const put = (p: Pupil) => setPupils((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const drop = (id: string) => setPupils((ps) => ps.filter((x) => x.id !== id));

  const save = (p: Pupil, column: PupilColumn, text: string) => {
    const change = cellChange(p, column, text);
    if (!change || !api.updatePupil) return;
    void run('Saving', async () => put(await api.updatePupil!(classId, p.id, change, getEnvelope())));
  };
  const add = () =>
    void run('Adding a pupil', async () => {
      const added = await api.addPupils!(classId, [{}], getEnvelope());
      setPupils((ps) => withAdded(ps, added));
    });
  const move = (p: Pupil, to: string) =>
    void run('Moving the pupil', async () => {
      await api.movePupil!(classId, p.id, to, getEnvelope());
      drop(p.id);
      // The class the pupil joined, if it is held (its chat may be the open one).
      refreshOther(to);
    });
  const remove = (p: Pupil) =>
    void run('Removing the pupil', async () => {
      await api.archivePupil!(classId, p.id, getEnvelope());
      drop(p.id);
    });

  return (
    <section className="flex flex-col gap-2" aria-label="Pupils">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className={cardTitleClass}>Pupils</h2>
          <p className={hintClass}>One row a pupil, under a made-up label: never a name or initials. Keep the key to who is who outside this tool.</p>
          <p className={hintClass}>In the note, write anything the assistant should know about the pupil, such as a need or a recent grade. What you write is up to you.</p>
        </div>
        <Button size="sm" onClick={add} disabled={!pupils}>
          <Plus size={14} aria-hidden="true" /> Add a pupil
        </Button>
      </div>
      {failed && (
        <p className="error-text" role="alert">
          {failed}
        </p>
      )}
      {pupils && pupils.length === 0 && <p className="m-0 text-md text-muted-foreground">No pupils yet. You can also just describe the class in “About this class”.</p>}
      {pupils && pupils.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-md">
            <thead>
              <tr className="border-b border-border text-left text-sm text-foreground-2">
                <th className="px-2 py-1.5 font-medium" title="The pupil's number in this class">
                  No.
                </th>
                <th className="px-2 py-1.5 font-medium">Pupil</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-medium">
                    {c.title}
                  </th>
                ))}
                {adapt.available && <th className="px-2 py-1.5 font-medium">Adaptations (library)</th>}
                <th className="px-2 py-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pupils.map((p) => (
                <tr key={p.id} className="border-b border-border align-top last:border-b-0">
                  <th scope="row" className="px-2 py-2 text-right font-normal text-foreground-2 tabular-nums">
                    {p.number}
                  </th>
                  <td className="min-w-48 px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <Cell key={`${p.id}-l-${p.label}`} label={`Label for ${p.label}`} value={p.label} maxLength={PUPIL_LABEL_MAX} onSave={(t) => save(p, 'label', t)} />
                      <button
                        type="button"
                        className="flex-none rounded-sm border-0 bg-transparent p-1 text-muted-foreground hover:text-foreground"
                        aria-label={`A new made-up label for ${p.label}`}
                        title="A new made-up label"
                        onClick={() => save(p, 'label', makePupilLabel(pupils.map((x) => x.label)))}
                      >
                        <Dices size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {looksLikeName(p.label) && (
                      <p className="m-0 px-1.5 text-xs text-destructive" role="alert">
                        This looks like a name. Use a made-up label.
                      </p>
                    )}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={cn('px-1 py-1', c.wide ? 'min-w-56' : 'min-w-28')}>
                      <Cell
                        label={`${c.title} for ${p.label}`}
                        value={cellText(p, c.key)}
                        maxLength={PUPIL_TEXT_MAX}
                        multiline={c.wide}
                        onSave={(t) => save(p, c.key, t)}
                      />
                    </td>
                  ))}
                  {adapt.available && (
                    <td className="min-w-60 px-1 py-1">
                      <AdaptationsCell
                        label={p.label}
                        hintsFrom={p.note ? [p.note] : []}
                        chosen={adapt.of(p.id)}
                        library={adapt.library}
                        onWantLibrary={adapt.loadLibrary}
                        onAdd={(e) => adapt.add(p.id, e)}
                        onUpdate={adapt.update}
                        onRemove={adapt.remove}
                      />
                    </td>
                  )}
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      {otherClasses.length > 0 && (
                        <select
                          aria-label={`Move ${p.label} to another class`}
                          className="rounded-sm border border-border bg-card px-1 py-0.5 text-sm"
                          value=""
                          onChange={(e) => e.target.value && move(p, e.target.value)}
                        >
                          <option value="">Move to…</option>
                          {otherClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className="rounded-sm border-0 bg-transparent p-1 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${p.label} (left the class)`}
                        title="Remove (left the class)"
                        onClick={() => remove(p)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A cell's text box, saved when it loses focus; `multiline` wraps and grows with its text. */
function Cell({ label, value, maxLength, multiline, onSave }: { label: string; value: string; maxLength: number; multiline?: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => autoGrow(ref.current, 240), [text]);
  const common = { 'aria-label': label, className: cn(fieldClass(), multiline && 'block resize-none'), value: text, maxLength, onBlur: () => onSave(text) };
  if (multiline) return <textarea ref={ref} rows={1} {...common} onChange={(e) => setText(e.target.value)} />;
  return (
    <input
      {...common}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
