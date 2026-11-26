/**
 * One pedagogy entry in full: how to do it, its claims with their passages and sources (as the
 * "i" hover shows them), recipes for each kind of artefact, risks, and the entries it links to.
 */
import type { EntryDetail as Detail } from '../../api/pedagogy';
import { ChatMarkdown } from '../../components/ChatMarkdown';
import { ClaimCard } from '../../components/pedagogy/ClaimInfo';
import { cardClass, cardTitleClass, hintClass } from '../classes/styles';
import { EntryBadges } from './EntryBadges';
import { TYPE_SINGULAR } from './labels';

const RELATIONS: Record<string, string> = {
  uses_principle: 'Uses',
  aligns_to: 'Aligns to',
  caution_from: 'Cautions',
  demonstrated_by: 'Shown in',
  conflicts_with: 'Conflicts with',
  addresses: 'Addresses',
};
const LINKED_FROM: Record<string, string> = { aligns_to: 'Aligned to this', caution_from: 'A caution for', uses_principle: 'Used by', conflicts_with: 'Conflicts with' };

export function EntryDetail({ detail, onOpen, onBack }: { detail: Detail; onOpen: (id: string) => void; onBack: () => void }) {
  const e = detail.entry;
  const links = [
    ...Object.entries(detail.related).map(([k, v]) => [RELATIONS[k] ?? k, v] as const),
    ...Object.entries(detail.linked_from).map(([k, v]) => [LINKED_FROM[k] ?? k, v] as const),
  ].filter(([, v]) => v.length);
  return (
    <article className="flex flex-col gap-4" aria-label={e.title}>
      <button type="button" className="w-fit border-0 bg-transparent p-0 text-sm text-muted-foreground hover:text-foreground" onClick={onBack}>
        ← All entries
      </button>
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-2xl leading-tight font-semibold">{e.title}</h2>
        <EntryBadges type={e.type} evidence={e.evidence} status={e.status} changesGoal={e.facets.changes_goal === true} />
        <p className="m-0 text-md text-foreground-2">{e.summary}</p>
      </header>
      {e.body && <ChatMarkdown text={e.body} />}
      {e.risks.length > 0 && (
        <section className={cardClass} aria-label="Risks">
          <h3 className={cardTitleClass}>Risks</h3>
          <ul className="m-0 pl-5 text-md">
            {e.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      {Object.keys(e.artefact_recipes).length > 0 && (
        <section className={cardClass} aria-label="In each kind of artefact">
          <h3 className={cardTitleClass}>In each kind of artefact</h3>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-md">
            {Object.entries(e.artefact_recipes).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-medium capitalize">{k.replace(/_/g, ' ')}</dt>
                <dd className="m-0 text-foreground-2">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="flex flex-col gap-2" aria-label="Claims">
        <h3 className={cardTitleClass}>Claims the assistant can cite</h3>
        <p className={hintClass}>Each is one statement in the curator’s words, with the passage and source behind it. The assistant cites these by id; the “i” in its replies opens the same.</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {e.claims.map((c) => (
            <li key={c.id} className={cardClass}>
              <ClaimCard claim={c} />
              <code className="text-2xs text-muted-foreground">{c.id}</code>
            </li>
          ))}
        </ul>
      </section>
      {links.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label="Linked entries">
          <h3 className={cardTitleClass}>Linked entries</h3>
          {links.map(([label, list]) => (
            <p key={label} className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-md">
              <span className="text-foreground-2">{label}:</span>
              {list.map((x) => (
                <button key={x.id} type="button" className="border-0 bg-transparent p-0 text-primary underline" onClick={() => onOpen(x.id)} title={TYPE_SINGULAR[x.type]}>
                  {x.title}
                </button>
              ))}
            </p>
          ))}
        </section>
      )}
    </article>
  );
}
