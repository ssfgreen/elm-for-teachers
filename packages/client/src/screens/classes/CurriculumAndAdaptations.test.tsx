import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassesList, CurriculumItem, PupilAdaptation } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { EntryBrief } from '../../api/pedagogy';
import { classInView, CurriculumSection } from '../../components/sidebar/CurriculumSection';
import { AdaptationsCell } from './AdaptationsCell';
import { CurriculumCard } from './CurriculumCard';
import { startLevel } from './curriculumView';

afterEach(cleanup);

const T = '2026-11-12T09:00:00.000Z';
const envelope = { client_ts: T, focus_pane: 'none' as const, doc_id: null, thread_id: null };
const item = (code: string, status: CurriculumItem['status'], id = code): CurriculumItem => ({ id, class_id: 'C', framework: 'cfe-eo', code, kind: 'eo', text: `Text of ${code}`, source_version: 'v1', status, created_at: T, updated_at: T });

describe('the Curriculum card', () => {
  it('lists what the class is on now, next and done, adds from a search and moves items', async () => {
    const pickCurriculum = vi.fn(async (_c: string, picks: { code: string }[], status: CurriculumItem['status']) => picks.map((p) => item(p.code, status, `new-${p.code}`)));
    const setCurriculumStatus = vi.fn(async (_c: string, id: string, status: string) => ({ ...item('LIT 2-16a', status as 'done', id) }));
    const searchCurriculum = vi.fn(async () => ({ version: 'v9', total: 2, options: [{ code: 'ENG 2-19a', text: 'I can discuss structure.', area: 'Literacy and English', organiser: 'Reading', sub_organiser: 'Understanding, analysing and evaluating' }, { code: 'LIT 2-16a', text: 'Main ideas.', area: 'Literacy and English', organiser: 'Reading', sub_organiser: null }], truncated: false }));
    const getCurriculum = async () => ({ benchmark_levels: ['second', 'third'], areas: [{ id: 'lit', name: 'Literacy and English', organisers: ['Listening and talking', 'Reading'], counts: {} }] });
    const curriculumBenchmarks = vi.fn(async (codes: string[]) => ({ benchmark_levels: ['second', 'third'], benchmarks: [{ id: 'b1', area: 'Literacy and English', level: 'second', section: 'Reading', organiser: 'Reading', codes, text: 'Identifies the main ideas of a text with appropriate detail.' }] }));
    const api = { getClass: async () => ({ class: {} as never, year_group: null, pupils: [], curriculum: [item('LIT 2-16a', 'now', 'i1')] }), pickCurriculum, setCurriculumStatus, searchCurriculum, getCurriculum, curriculumBenchmarks } as unknown as SessionApi;
    const onChanged = vi.fn();
    const onIdeas = vi.fn();
    render(<CurriculumCard classId="C" level={2} api={api} getEnvelope={() => envelope} onChanged={onChanged} onIdeas={onIdeas} />);
    expect(await screen.findByText('LIT 2-16a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ideas for LIT 2-16a' }));
    expect(onIdeas).toHaveBeenCalledWith('LIT 2-16a');

    fireEvent.click(screen.getByRole('button', { name: 'Add from the curriculum' }));
    fireEvent.change(await screen.findByLabelText('Curriculum area'), { target: { value: 'Literacy and English' } });
    fireEvent.change(screen.getByLabelText('Organiser'), { target: { value: 'Reading' } });
    fireEvent.change(screen.getByLabelText('Search the curriculum'), { target: { value: 'structure' } });
    await waitFor(() => expect(searchCurriculum).toHaveBeenLastCalledWith({ query: 'structure', level: 2, area: 'Literacy and English', organiser: 'Reading' }));
    expect(await screen.findByRole('region', { name: 'Literacy and English › Reading › Understanding, analysing and evaluating' })).toBeTruthy();
    // An outcome's benchmarks, on asking.
    fireEvent.click(screen.getAllByRole('button', { name: 'Benchmarks for ENG 2-19a' })[0]!);
    expect(await screen.findByRole('list', { name: 'Benchmarks for ENG 2-19a' })).toBeTruthy();
    expect(curriculumBenchmarks).toHaveBeenCalledWith(['ENG 2-19a']);
    expect((screen.getByRole('button', { name: 'Add LIT 2-16a' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Add as'), { target: { value: 'planned' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ENG 2-19a' }));
    await waitFor(() => expect(pickCurriculum).toHaveBeenCalledWith('C', [{ code: 'ENG 2-19a', text: 'I can discuss structure.', source_version: 'v9', framework: 'cfe-eo', kind: 'eo' }], 'planned', envelope));
    expect(await screen.findByRole('list', { name: 'Next' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Status of LIT 2-16a'), { target: { value: 'done' } });
    await waitFor(() => expect(setCurriculumStatus).toHaveBeenCalledWith('C', 'i1', 'done', envelope));
    expect(await screen.findByRole('list', { name: 'Done' })).toBeTruthy();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('starts the picker at the level the stage gives', () => {
    expect(startLevel('Primary 7, Second level')).toBe(2);
    expect(startLevel(null, 'S1')).toBe(3);
    expect(startLevel('Mixed')).toBeUndefined();
  });
});

const lib: EntryBrief[] = [
  { id: 'adp-spacing', type: 'adaptation', title: 'Individual spacing', summary: 'Wider spacing.', status: 'draft', evidence: 'moderate', facets: { often_relevant_to: ['dyslexia'] }, claims: [] },
  { id: 'adp-lower', type: 'adaptation', title: 'Lower reading-level version', summary: 'Simpler text.', status: 'draft', evidence: 'practitioner_wisdom', changes_goal: true, facets: { often_relevant_to: ['EAL'] }, claims: [] },
];
const chosen: PupilAdaptation = { id: 'a1', pupil_id: 'P', entry_id: 'adp-spacing', title: 'Individual spacing', changes_goal: false, status: 'trialling', overrides: null, source_version: null, created_at: T, updated_at: T };

describe("a pupil's adaptations", () => {
  it('suggest from the note as a hint, and ask before a modification', () => {
    const onAdd = vi.fn();
    render(<AdaptationsCell label="tidy-puffin" hintsFrom={['Dyslexic. Reads slowly and loses their place.']} chosen={[]} library={lib} onWantLibrary={vi.fn()} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an adaptation for tidy-puffin' }));
    const dialog = screen.getByRole('dialog', { name: 'Adaptations for tidy-puffin' });
    expect(within(dialog).getByText(/Often relevant to dyslexia: a hint/)).toBeTruthy();
    expect(within(within(dialog).getByRole('list', { name: 'Suggested' })).getByText('Individual spacing')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose Lower reading-level version for tidy-puffin' }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('group', { name: 'Confirm a modification' }).textContent).toContain('changes the learning goal');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, a modification' }));
    expect(onAdd).toHaveBeenCalledWith(lib[1]);
  });

  it("change status and the pupil's own settings, saved as they leave the box", () => {
    const onUpdate = vi.fn();
    render(<AdaptationsCell label="tidy-puffin" hintsFrom={[]} chosen={[chosen]} library={lib} onWantLibrary={vi.fn()} onAdd={vi.fn()} onUpdate={onUpdate} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Does Individual spacing help tidy-puffin?'), { target: { value: 'confirmed' } });
    expect(onUpdate).toHaveBeenLastCalledWith(chosen, { status: 'confirmed' });
    const box = screen.getByLabelText("tidy-puffin's own settings for Individual spacing");
    fireEvent.change(box, { target: { value: ' amber overlay, Comic Sans 14pt ' } });
    fireEvent.blur(box);
    expect(onUpdate).toHaveBeenLastCalledWith(chosen, { overrides: 'amber overlay, Comic Sans 14pt' });
  });
});

const list: ClassesList = {
  schools: [],
  year_groups: [],
  classes: [
    { id: 'C1', session_id: 's', school_id: 'S', school_year: '2026-27', year_group_id: 'Y', name: 'P7A', stage: null, subject: null, note: null, starred_at: T, copied_from: null, created_at: T, archived_at: null, pupil_count: 0, needs_counts: {} },
    { id: 'C2', session_id: 's', school_id: 'S', school_year: '2026-27', year_group_id: 'Y', name: 'P7B', stage: null, subject: null, note: null, starred_at: null, copied_from: null, created_at: T, archived_at: null, pupil_count: 0, needs_counts: {} },
  ],
};

describe('the sidebar’s Curriculum', () => {
  it('is about the open class, else the first starred one', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    expect(classInView(list, 'C2', now)?.name).toBe('P7B');
    expect(classInView(list, null, now)?.name).toBe('P7A');
  });

  it('lists what the class is on now, each opening the curriculum on that outcome', async () => {
    const onOpenCurriculum = vi.fn();
    const api = { getClass: async () => ({ class: {} as never, year_group: null, pupils: [], curriculum: [item('LIT 2-16a', 'now'), item('ENG 2-19a', 'done')] }) };
    render(<CurriculumSection list={list} activeClassId="C2" api={api} onOpenClass={vi.fn()} onOpenCurriculum={onOpenCurriculum} />);
    fireEvent.click(await screen.findByRole('button', { name: /LIT 2-16a/ }));
    expect(onOpenCurriculum).toHaveBeenCalledWith('C2', 'LIT 2-16a');
    expect(screen.queryByText('ENG 2-19a')).toBeNull();
    expect(screen.getByText('Curriculum · P7B')).toBeTruthy();
  });

  it('opens the curriculum from its heading, and the class’s page to pick what it is on', async () => {
    const onOpenClass = vi.fn();
    const onOpenCurriculum = vi.fn();
    const api = { getClass: async () => ({ class: {} as never, year_group: null, pupils: [], curriculum: [] }) };
    render(<CurriculumSection list={list} activeClassId="C2" api={api} onOpenClass={onOpenClass} onOpenCurriculum={onOpenCurriculum} />);
    fireEvent.click(screen.getByRole('heading', { name: 'Curriculum · P7B' }).querySelector('button')!);
    expect(onOpenCurriculum).toHaveBeenCalledWith('C2');
    fireEvent.click(await screen.findByRole('button', { name: 'Pick what P7B is working on' }));
    expect(onOpenClass).toHaveBeenCalledWith('C2');
  });
});
