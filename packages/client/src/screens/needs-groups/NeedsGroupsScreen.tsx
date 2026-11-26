/**
 * Needs groups screen (T1): manage generic or class-assigned groups of learning needs
 * ("Dyslexia group", "Level 1 learners") without storing any pupil names or personal data.
 */
import { useState, type FormEvent } from 'react';
import { NEEDS_GROUP_NAME_MAX, NEEDS_GROUP_TEXT_MAX, type ClassSummary, type NeedsGroupSummary } from '@edw/shared';
import type { ThreadPlace } from '../../api/classes';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { Button } from '../../components/ui/button';
import { cardClass, cardTitleClass, fieldClass, hintClass } from '../classes/styles';
import { useNeedsGroups } from './useNeedsGroups';

export interface NeedsGroupsScreenProps {
  api: SessionApi;
  getEnvelope: () => Envelope;
  classes: ClassSummary[];
  onStartChat?: (place: ThreadPlace) => void;
}

export function NeedsGroupsScreen({ api, getEnvelope, classes, onStartChat }: NeedsGroupsScreenProps) {
  const state = useNeedsGroups(api, getEnvelope);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [whatHelps, setWhatHelps] = useState('');
  const [saving, setSaving] = useState(false);

  const openClasses = classes.filter((c) => !c.archived_at);
  const activeGroups = state.groups.filter((g) => !g.archived_at);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const created = await state.create({
      name: name.trim(),
      description: description.trim() || null,
      what_helps: whatHelps.trim() || null,
    });
    setSaving(false);
    if (created) {
      setName('');
      setDescription('');
      setWhatHelps('');
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-6 py-6" aria-label="Needs groups">
      <div className="mx-auto flex w-full max-w-220 flex-col gap-5">
        <header>
          <h1 className="m-0 text-xl font-semibold text-foreground">Needs groups</h1>
          <p className="mt-1 text-md text-foreground-2">
            Group shared learning barriers and supports across classes. Keep these generic — never enter pupils’ names or personal details.
          </p>
        </header>

        {state.error && (
          <p className="error-text m-0 text-md" role="alert">
            {state.error}
          </p>
        )}

        <form className={cardClass} onSubmit={(e) => void onCreate(e)} aria-label="Add needs group">
          <h2 className={cardTitleClass}>Add a needs group</h2>
          <div className="mt-2 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-md">
              <span className="text-foreground-2">Group name</span>
              <input
                type="text"
                className={fieldClass()}
                placeholder="For example: Dyslexia support group, Level 1 readers"
                value={name}
                maxLength={NEEDS_GROUP_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-md">
              <span className="text-foreground-2">Learning barriers (optional)</span>
              <textarea
                className="w-full rounded-md border border-border-strong bg-card px-2.5 py-2 text-md"
                rows={2}
                placeholder="Describe shared needs without naming any pupil."
                value={description}
                maxLength={NEEDS_GROUP_TEXT_MAX}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-md">
              <span className="text-foreground-2">What helps (optional)</span>
              <textarea
                className="w-full rounded-md border border-border-strong bg-card px-2.5 py-2 text-md"
                rows={2}
                placeholder="For example: Chunked instructions, word banks, 1.5 line spacing."
                value={whatHelps}
                maxLength={NEEDS_GROUP_TEXT_MAX}
                onChange={(e) => setWhatHelps(e.target.value)}
              />
            </label>
            <div>
              <Button type="submit" size="sm" disabled={saving || !name.trim()}>
                {saving ? 'Adding…' : 'Add needs group'}
              </Button>
            </div>
          </div>
        </form>

        {state.loading ? (
          <p className={hintClass}>Loading needs groups…</p>
        ) : activeGroups.length === 0 ? (
          <p className={hintClass}>No needs groups yet. Add one above to reuse across your classes and chats.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {activeGroups.map((group) => (
              <NeedsGroupCard
                key={group.id}
                group={group}
                classes={openClasses}
                onArchive={() => void state.archive(group.id)}
                onToggleClass={(classId) => void state.toggleClass(group, classId)}
                onStartChat={onStartChat ? () => onStartChat({ needs_group_id: group.id }) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function NeedsGroupCard({
  group,
  classes,
  onArchive,
  onToggleClass,
  onStartChat,
}: {
  group: NeedsGroupSummary;
  classes: ClassSummary[];
  onArchive: () => void;
  onToggleClass: (classId: string) => void;
  onStartChat?: () => void;
}) {
  return (
    <article className={cardClass} aria-label={group.name}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-foreground">{group.name}</h2>
          {group.description && <p className="mt-1 mb-0 text-md text-foreground-2">{group.description}</p>}
          {group.what_helps && (
            <p className="mt-1 mb-0 text-md text-foreground">
              <span className="font-medium">What helps:</span> {group.what_helps}
            </p>
          )}
        </div>
        <div className="flex flex-none gap-2">
          {onStartChat && (
            <Button size="sm" variant="default" onClick={onStartChat}>
              Start chat
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onArchive}>
            Archive
          </Button>
        </div>
      </div>

      {group.adaptations.length > 0 && (
        <div className="mt-3">
          <p className="m-0 text-sm font-medium text-foreground-2">Chosen adaptations</p>
          <ul className="mt-1 mb-0 list-disc pl-5 text-sm text-foreground">
            {group.adaptations.map((a) => (
              <li key={a.id}>
                {a.title} ({a.status})
              </li>
            ))}
          </ul>
        </div>
      )}

      {classes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground-2">Classes:</span>
          {classes.map((c) => {
            const linked = group.class_ids.includes(c.id);
            return (
              <label key={c.id} className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-sm">
                <input type="checkbox" checked={linked} onChange={() => onToggleClass(c.id)} />
                <span>{c.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </article>
  );
}
