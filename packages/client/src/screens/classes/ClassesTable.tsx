/**
 * The Classes screen's list (docs/classes.md): every class in a school year (this one by
 * default, or all), sortable by any column, each with a star that keeps it in the sidebar. Built
 * for a secondary teacher's many classes; a primary teacher sees a row or two and stars theirs.
 */
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, GraduationCap, Plus, Search, Star } from 'lucide-react';
import { CLASS_FIELD_MAX, CLASS_NAME_MAX, schoolYearOf } from '@edw/shared';
import { EditableTitle } from '../../components/EditableTitle';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import { classRows, nextSort, schoolYears, type Sort, type SortKey } from '../../state/classList';
import { screenClass } from './styles';
import type { Classes } from './useClasses';

const COLUMNS: { key: SortKey; title: string }[] = [
  { key: 'name', title: 'Class' },
  { key: 'year_group', title: 'Year group' },
  { key: 'subject', title: 'Subject' },
  { key: 'school_year', title: 'School year' },
  { key: 'pupils', title: 'Pupils' },
];

export function ClassesTable({ classes }: { classes: Classes }) {
  const { list } = classes;
  const current = schoolYearOf(new Date());
  const [year, setYear] = useState(current);
  const [sort, setSort] = useState<Sort>({ key: 'year_group', dir: 'asc' });
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const rows = classRows(list, year, sort, query);
  const years = schoolYears(list, current);
  const schools = list.schools.filter((s) => !s.archived_at);
  const anyClasses = list.classes.some((c) => !c.archived_at);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
    } catch {
      setFailed(`${what} did not work. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={screenClass}>
      <div className="mx-auto flex max-w-250 flex-col gap-5 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 flex items-center gap-2 text-3xl font-semibold">
            <GraduationCap size={26} aria-hidden="true" /> Classes
          </h1>
          <p className="m-0 text-foreground-2">
            Your classes, school year by school year. Start a chat from a class and the assistant knows who it is for: the class’s stage and your notes on the class and on each pupil,
            under a made-up label rather than a name. Star your own classes to keep them in the sidebar.
          </p>
          {schools.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-md text-foreground-2">
              <span>School:</span>
              <EditableTitle
                itemKey={s.id}
                value={s.name}
                onRename={(name) => void run('Renaming the school', () => classes.renameSchool(s.id, name))}
                as="span"
                className="font-medium text-foreground"
                inputClassName="rounded-sm border border-border-strong px-1 py-0.5 text-md"
                inputLabel="School name"
                maxLength={CLASS_NAME_MAX}
              />
            </div>
          ))}
        </header>
        {failed && (
          <p className="error-text" role="alert">
            {failed}
          </p>
        )}
        {!anyClasses && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-label="Get started">
            <p className="m-0">No classes yet. Add one below, or try the demo class: a P7 class of 20 pupils, from a class register with the names left out.</p>
            <div>
              <Button variant="primary" disabled={busy} onClick={() => void run('Adding the demo class', classes.addDemoClass)}>
                Add the demo class (P7A)
              </Button>
            </div>
          </section>
        )}
        {/* One search over every column, the school year to show, and Add a class. */}
        <div className="flex flex-wrap items-center gap-2 text-md">
          <div className="relative min-w-60 flex-1">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search classes" placeholder="Search by class, year group, subject, need…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-8 text-md" />
          </div>
          <label htmlFor="school-year" className="sr-only">
            School year
          </label>
          <select id="school-year" className="rounded-sm border border-border bg-card px-1.5 py-1.5" value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
                {y === current ? ' (this year)' : ''}
              </option>
            ))}
            <option value="all">All years</option>
          </select>
          <Button size="sm" variant={adding ? 'ghost' : 'default'} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            <Plus size={14} aria-hidden="true" /> Add a class
          </Button>
        </div>
        {adding && (
          <NewClassForm
            schoolYear={year === 'all' ? current : year}
            yearGroups={[...new Set(list.year_groups.filter((y) => !y.archived_at && y.school_year === (year === 'all' ? current : year)).map((y) => y.name))]}
            disabled={busy}
            onAdd={(fields) => run('Adding the class', () => classes.addClass(fields))}
          />
        )}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-md">
            <thead>
              <tr className="border-b border-border text-left text-sm text-foreground-2">
                <th className="w-10 px-2 py-1.5">
                  <span className="sr-only">Starred</span>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-medium" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button type="button" className="flex items-center gap-1 border-0 bg-transparent p-0 font-medium text-foreground-2 hover:text-foreground" onClick={() => setSort(nextSort(sort, c.key))}>
                      {c.title}
                      {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-3 py-3 text-muted-foreground">
                    {query.trim() ? `No classes match “${query.trim()}”${year === 'all' ? '' : ` in ${year}`}.` : `No classes in ${year === 'all' ? 'any year' : year} yet.`}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-hover">
                  <td className="px-2 py-1.5">
                    <StarButton name={r.name} starred={!!r.starred_at} onToggle={() => void run('Starring', () => classes.updateClass(r.id, { starred: !r.starred_at }))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" className="border-0 bg-transparent p-0 text-left font-medium hover:underline" onClick={() => classes.showClasses({ classId: r.id })}>
                      {r.name}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" className="border-0 bg-transparent p-0 text-left hover:underline" onClick={() => classes.showClasses({ yearGroupId: r.year_group_id })}>
                      {r.year_group_name}
                    </button>
                    {schools.length > 1 && <span className="block text-xs text-muted-foreground">{r.school_name}</span>}
                  </td>
                  <td className="px-2 py-1.5">{r.subject}</td>
                  <td className="px-2 py-1.5 text-foreground-2">{r.school_year}</td>
                  <td className="px-2 py-1.5 text-foreground-2">
                    {r.pupil_count || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anyClasses && (
          <p className="m-0 text-sm text-muted-foreground">
            <button type="button" className="border-0 bg-transparent p-0 text-sm text-muted-foreground underline hover:text-foreground" disabled={busy} onClick={() => void run('Adding the demo class', classes.addDemoClass)}>
              Add the demo class (P7A)
            </button>{' '}
            to try it out.
          </p>
        )}
      </div>
    </div>
  );
}

export function StarButton({ name, starred, onToggle, size = 16 }: { name: string; starred: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      className={cn('rounded-sm border-0 bg-transparent p-1 hover:text-foreground', starred ? 'text-warning-solid' : 'text-muted-foreground')}
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${name}` : `Star ${name} (keep it in the sidebar)`}
      title={starred ? 'Starred: in the sidebar' : 'Star: keep it in the sidebar'}
      onClick={onToggle}
    >
      <Star size={size} aria-hidden="true" fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Name, year group (made if new) and subject; the class goes into the school year shown. */
function NewClassForm({ schoolYear, yearGroups, disabled, onAdd }: { schoolYear: string; yearGroups: string[]; disabled: boolean; onAdd: (f: { name: string; year_group: string; subject: string | null; school_year: string }) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [yearGroup, setYearGroup] = useState('');
  const [subject, setSubject] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !yearGroup.trim()) return;
    void onAdd({ name: name.trim(), year_group: yearGroup.trim(), subject: subject.trim() || null, school_year: schoolYear }).then(() => {
      setName('');
      setSubject('');
    });
  };
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3" onSubmit={submit} aria-label="New class">
      <datalist id="year-group-names">
        {yearGroups.map((y) => (
          <option key={y} value={y} />
        ))}
      </datalist>
      <label className="flex flex-col gap-1 text-sm text-foreground-2">
        Class
        <Input value={name} maxLength={CLASS_NAME_MAX} placeholder="e.g. 7B, S2 Maths set 1" onChange={(e) => setName(e.target.value)} className="w-48 text-md" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-foreground-2">
        Year group
        <Input value={yearGroup} maxLength={CLASS_NAME_MAX} placeholder="e.g. P7, S2" list="year-group-names" onChange={(e) => setYearGroup(e.target.value)} className="w-32 text-md" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-foreground-2">
        Subject (optional)
        <Input value={subject} maxLength={CLASS_FIELD_MAX} onChange={(e) => setSubject(e.target.value)} className="w-44 text-md" />
      </label>
      <Button type="submit" size="sm" disabled={disabled || !name.trim() || !yearGroup.trim()}>
        <Plus size={14} aria-hidden="true" /> Add class to {schoolYear}
      </Button>
    </form>
  );
}
