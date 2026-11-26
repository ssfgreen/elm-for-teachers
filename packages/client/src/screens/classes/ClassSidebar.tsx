/**
 * The sidebar on the right of a class's page (under the lists on a narrow screen): the class's
 * details, the box that starts a chat for it (high up, so it is on the first screen), the note about
 * it, its curriculum, the class code for pupils, the pupil logins, the pupils who joined, the pupil reader's settings, and what is kept.
 */
import type { ReactNode } from 'react';
import type { ClassSummary, YearGroup } from '@edw/shared';
import { CLASS_FIELD_MAX, CLASS_NOTE_MAX } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { SavedText } from '../../components/SavedText';
import { CurriculumCard } from './CurriculumCard';
import { ReaderSettingsCard } from './ReaderSettingsCard';
import { ClassCodeCard } from './pupil-sign-in/ClassCodeCard';
import { JoinedPupilsCard } from './pupil-sign-in/JoinedPupilsCard';
import { PupilLoginsCard } from './pupil-sign-in/PupilLoginsCard';
import { startLevel } from './curriculumView';
import { cardClass, cardTitleClass, fieldClass, hintClass } from './styles';
import type { Classes } from './useClasses';

type Update = (fields: Parameters<Classes['updateClass']>[1]) => ReturnType<Classes['updateClass']>;

/** Stage, subject and year group, each saved as it is changed. */
export function ClassDetails({
  cls,
  yearGroups,
  update,
}: {
  cls: ClassSummary;
  yearGroups: YearGroup[];
  update: Update;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-md">
      <span className="text-foreground-2">Stage</span>
      <SavedText
        key={`st-${cls.id}`}
        label="Stage"
        className={fieldClass()}
        placeholder="For example: Primary 7, Second level"
        value={cls.stage}
        maxLength={CLASS_FIELD_MAX}
        onSave={(stage) => update({ stage })}
      />
      <span className="text-foreground-2">Subject</span>
      <SavedText
        key={`su-${cls.id}`}
        label="Subject"
        className={fieldClass()}
        placeholder="For example: English and literacy (optional)"
        value={cls.subject}
        maxLength={CLASS_FIELD_MAX}
        onSave={(subject) => update({ subject })}
      />
      <label htmlFor={`yg-${cls.id}`} className="text-foreground-2">
        Year group
      </label>
      <select
        id={`yg-${cls.id}`}
        className="w-fit rounded-sm border border-border bg-card px-1.5 py-1 text-md"
        value={cls.year_group_id}
        onChange={(e) => void update({ year_group_id: e.target.value })}
      >
        {yearGroups.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ClassSidebarProps {
  cls: ClassSummary;
  yearGroups: YearGroup[];
  update: Update;
  classes: Classes;
  api: SessionApi;
  getEnvelope: () => Envelope;
  onIdeas?: (code: string) => void;
  /** The box that starts a chat for the class (`PlaceComposer`), drawn as it is. */
  composer: ReactNode;
}

export function ClassSidebar({
  cls,
  yearGroups,
  update,
  classes,
  api,
  getEnvelope,
  onIdeas,
  composer,
}: ClassSidebarProps) {
  const yearGroup = yearGroups.find((y) => y.id === cls.year_group_id);
  return (
    <aside
      className="flex w-88 flex-none flex-col gap-4 @max-[62rem]:w-full"
      aria-label="About the class"
    >
      <section className={cardClass} aria-label="Class details">
        <h2 className={cardTitleClass}>Class details</h2>
        <ClassDetails cls={cls} yearGroups={yearGroups} update={update} />
      </section>
      <section className={cardClass} aria-label="Ask or start a chat">
        <h2 className={cardTitleClass}>Ask or start a chat</h2>
        <p className={hintClass}>The assistant will know the chat is for {cls.name}.</p>
        {composer}
      </section>
      <section className={cardClass} aria-label="About this class">
        <h2 className={cardTitleClass}>About this class</h2>
        <p className={hintClass}>
          What the assistant should know about the class as a whole. No pupils’ names.
        </p>
        <SavedText
          key={`n-${cls.id}`}
          label="About this class"
          className="w-full resize-none rounded-md border border-border-strong bg-card px-2.5 py-2.25 text-md"
          placeholder="For example: 5 pupils with dyslexia, reading ages from P5 to S1. Quieter after lunch."
          value={cls.note}
          maxLength={CLASS_NOTE_MAX}
          onSave={(note) => update({ note })}
          boxed
        />
      </section>
      <CurriculumCard
        key={`cur-${cls.id}`}
        classId={cls.id}
        level={startLevel(cls.stage, yearGroup?.name)}
        api={api}
        getEnvelope={getEnvelope}
        onChanged={() => void classes.refresh()}
        onIdeas={onIdeas}
      />
      <ClassCodeCard key={`cc-${cls.id}`} classId={cls.id} archived={!!cls.archived_at} api={api} getEnvelope={getEnvelope} />
      <PupilLoginsCard key={`pl-${cls.id}`} classId={cls.id} name={cls.name} archived={!!cls.archived_at} api={api} getEnvelope={getEnvelope} />
      <JoinedPupilsCard key={`jp-${cls.id}`} classId={cls.id} archived={!!cls.archived_at} api={api} getEnvelope={getEnvelope} />
      <ReaderSettingsCard key={`rs-${cls.id}`} classId={cls.id} api={api} getEnvelope={getEnvelope} />
      <section className={cardClass} aria-label="What is kept">
        <h2 className={cardTitleClass}>What is kept</h2>
        <p className={hintClass}>
          Pupils have made-up labels, never names. The table is kept for you and sent to the
          assistant in this class’s chats, only to a model that keeps no data, with the library
          adaptations chosen for each pupil. The study’s records keep only how many pupils and needs
          there are. The curriculum picked is kept in full.
        </p>
      </section>
    </aside>
  );
}
