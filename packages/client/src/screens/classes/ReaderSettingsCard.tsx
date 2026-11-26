/**
 * The class page's "Pupil reader" card (#186): how many follow-ups a pupil may ask after one
 * answer, each pupil's default budget, and the reader's safety instruction (#195,
 * SafetyInstructionField.tsx). Each box saves when it loses focus or on Enter; an
 * empty box goes back to config's default, marked "(default)". A value that is not in limits, or
 * that the server refuses, puts back the last good one and says so.
 */
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { decideCommit, formatPounds, parseFollowUps, parsePounds, type Parsed } from './readerSettings';
import { SafetyInstructionField } from './SafetyInstructionField';
import { cardClass, cardTitleClass, hintClass } from './styles';
import { useFieldSave } from './useFieldSave';
import { useReaderSettings, type ReaderField, type ReaderValue, type SaveOutcome } from './useReaderSettings';

interface FieldProps {
  id: string;
  label: string;
  hint: string;
  shown: string;
  isDefault: boolean;
  parse: (text: string) => Parsed;
  invalid: string;
  /** The box's text for a value, and for the default (null). */
  display: (value: number | null) => string;
  onSave: (value: number | null) => Promise<SaveOutcome>;
}

function SettingField({ id, label, hint, shown, isDefault, parse, invalid, display, onSave }: FieldProps) {
  const field = useFieldSave<number>(shown, isDefault, onSave, { display });
  const { text, state, problem, save, refuse, reset } = field;

  const commit = async () => {
    field.blur();
    const c = decideCommit(text, field.basis.shown, field.basis.isDefault, parse);
    if (c.kind === 'none') return;
    if (c.kind === 'reset') return reset();
    if (c.kind === 'invalid') return refuse(invalid);
    await save(c.value);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="w-28 flex-none text-md text-foreground-2">
          {label}
        </label>
        <input
          id={id}
          className="w-24 rounded-sm border border-border-strong bg-card px-2 py-1 text-md"
          inputMode="decimal"
          value={text}
          onChange={(e) => field.change(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-describedby={`${id}-hint`}
        />
        {isDefault && <span className="text-sm text-muted-foreground">(default)</span>}
        {state === 'saving' && <span className="ml-auto text-xs text-muted-foreground">Saving…</span>}
        {state === 'saved' && <span className="ml-auto text-xs text-muted-foreground">Saved</span>}
      </div>
      <p id={`${id}-hint`} className={hintClass}>
        {hint}
      </p>
      {state === 'failed' && (
        <p className="error-text m-0 text-xs" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

export function ReaderSettingsCard({ classId, api, getEnvelope }: { classId: string; api: SessionApi; getEnvelope: () => Envelope }) {
  const { settings, loadFailed, save } = useReaderSettings(api, classId, getEnvelope);
  if (!api.getReaderSettings) return null;
  const on = (field: ReaderField) => (value: ReaderValue) => save(field, value);
  return (
    <section className={cardClass} aria-label="Pupil reader">
      <h2 className={cardTitleClass}>Pupil reader</h2>
      <p className={hintClass}>For when pupils read with the assistant. Empty a number to go back to the default.</p>
      {loadFailed && (
        <p className="error-text m-0 text-sm" role="alert">
          The settings could not load. Reload the page to try again.
        </p>
      )}
      {settings && (
        <>
          <SettingField
            id={`rs-fu-${classId}`}
            label="Follow-ups"
            hint={`How many follow-ups a pupil may ask after one answer, 0 to 10. Default ${settings.defaults.follow_ups_max}.`}
            shown={String(settings.follow_ups_max)}
            isDefault={!settings.set.follow_ups_max}
            parse={parseFollowUps}
            display={(v) => String(v ?? settings.defaults.follow_ups_max)}
            invalid="Not saved: give a whole number from 0 to 10."
            onSave={on('follow_ups_max')}
          />
          <SettingField
            id={`rs-pb-${classId}`}
            label="Pupil budget"
            hint={`What each pupil may spend, £0 to £5. Default ${formatPounds(settings.defaults.pupil_budget_gbp)}.`}
            shown={formatPounds(settings.pupil_budget_gbp)}
            isDefault={!settings.set.pupil_budget_gbp}
            parse={parsePounds}
            display={(v) => formatPounds(v ?? settings.defaults.pupil_budget_gbp)}
            invalid="Not saved: give a sum from £0 to £5, such as £0.50 or 50p."
            onSave={on('pupil_budget_gbp')}
          />
          <SafetyInstructionField
            id={`rs-si-${classId}`}
            shown={settings.safety_instruction}
            isDefault={!settings.set.safety_instruction}
            defaultText={settings.defaults.safety_instruction}
            onSave={on('safety_instruction')}
          />
        </>
      )}
    </section>
  );
}
