import { useState } from 'react';
import type { FormEvent } from 'react';
import { DEFAULT_FEATURES, type Features } from '@edw/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CopyLink } from '../../admin/WorkspaceLinks';
import { FeatureTicks, PUPILS_HINT } from './FeaturesCell';
import { cardClass } from './styles';
import type { CreatedWorkspace } from './useAdminSessions';

export interface NewWorkspaceFormProps {
  /** Resolves true when the workspace was made, so the name box clears. */
  onCreate: (label: string, study: boolean, features: Features) => Promise<boolean>;
  created: CreatedWorkspace | null;
}

/** The "New workspace" card: a name, the study start, its feature switches, and the new link to copy. */
export function NewWorkspaceForm({ onCreate, created }: NewWorkspaceFormProps) {
  const [label, setLabel] = useState('');
  /** A study workspace starts with the demo class P7A and a demo chat for it (server/src/study/). */
  const [study, setStudy] = useState(true);
  /** Each starts at its default, so `pupils` starts unticked. */
  const [features, setFeatures] = useState<Features>({ ...DEFAULT_FEATURES });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (await onCreate(label.trim(), study, features)) setLabel('');
  };

  return (
    <section className={cardClass}>
      <h2 className="mb-3">New workspace</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.25 text-base text-foreground-2">
          <span>Name (for example the teacher or class)</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        </label>
        <label className="flex items-center gap-1.5 text-base text-foreground-2">
          <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} />
          Start with the demo class and a demo chat (study)
        </label>
        <fieldset className="flex flex-col gap-1 text-base text-foreground-2">
          <legend className="mb-1">Features</legend>
          <FeatureTicks features={features} onChange={(name, on) => setFeatures((f) => ({ ...f, [name]: on }))} />
          <span className="text-sm text-muted-foreground">{PUPILS_HINT}.</span>
        </fieldset>
        <Button type="submit" variant="primary" disabled={!label.trim()}>
          Create link
        </Button>
      </form>
      {created?.participant_url && (
        <p>
          Link for {created.session.label}: <code>{created.participant_url}</code>{' '}
          <CopyLink url={created.participant_url} />
        </p>
      )}
    </section>
  );
}
