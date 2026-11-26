import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CurriculumItem, Pupil, PupilFields } from '@edw/shared';
import type { ClassDetail } from '../../api/classes';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { useMentionSource } from '../../components/mentions/useMentionSource';
import { CurriculumSection } from '../../components/sidebar/CurriculumSection';
import { CurriculumCard } from './CurriculumCard';
import { PupilTable } from './PupilTable';

afterEach(cleanup);

const T = '2026-11-12T09:00:00.000Z';
const C1 = '01JC1ASS0000000000000000P7';
const pupil = (id: string, label: string, needs: string[], number: number): Pupil => ({ id, class_id: C1, number, label, needs, helps: null, working_at: null, note: null, position: 0, created_at: T, archived_at: null });
const item = (code: string, status: CurriculumItem['status'], id: string): CurriculumItem => ({ id, class_id: C1, code, text: `About ${code}`, status, kind: 'eo', framework: 'cfe-eo', source_version: null, created_at: T, updated_at: T });
const envelope = () => ({}) as Envelope;
const list = { schools: [], year_groups: [], classes: [{ id: C1, name: 'P7A', archived_at: null }] } as never;

function mockApi() {
  const pupils = [pupil('p1', 'tidy-puffin', ['Dyslexia'], 1), pupil('p2', 'jolly-teapot', [], 2)];
  const detail: ClassDetail = { class: {} as never, year_group: null, pupils, adaptations: [], curriculum: [item('LIT 2-16a', 'planned', 'i1')] };
  return {
    getClass: vi.fn(async () => detail),
    updatePupil: vi.fn(async (_c: string, id: string, fields: PupilFields) => ({ ...pupils.find((p) => p.id === id)!, ...fields }) as Pupil),
    archivePupil: vi.fn(async (_c: string, id: string) => ({ ...pupils.find((p) => p.id === id)!, archived_at: T })),
    setCurriculumStatus: vi.fn(async (_c: string, id: string, status: string) => ({ ...item('LIT 2-16a', status as CurriculumItem['status'], id) })),
  };
}

/** What the open chat's mentions know about the class. The class list never changes here. */
function Mentions({ api }: { api: ReturnType<typeof mockApi> }) {
  const source = useMentionSource({ api: api as unknown as SessionApi, classId: C1, className: 'P7A' });
  return <p data-testid="mentions">{source.pupils.map((p) => `${p.label}: ${p.note ?? ''}`).join(' | ')}</p>;
}

describe("a class's detail has one owner", () => {
  it('an edited pupil row reaches the mentions without the class list being refreshed', async () => {
    const api = mockApi();
    render(
      <>
        <PupilTable classId={C1} otherClasses={[]} api={api as unknown as SessionApi} getEnvelope={envelope} onChanged={() => undefined} />
        <Mentions api={api} />
      </>,
    );
    const table = within(await screen.findByRole('region', { name: 'Pupils' }));
    const note = await table.findByRole('textbox', { name: 'Note for jolly-teapot' });
    await waitFor(() => expect(screen.getByTestId('mentions').textContent).toBe('tidy-puffin:  | jolly-teapot: '));

    fireEvent.change(note, { target: { value: 'ADHD' } });
    await act(async () => {
      fireEvent.blur(note);
    });
    await waitFor(() => expect(screen.getByTestId('mentions').textContent).toBe('tidy-puffin:  | jolly-teapot: ADHD'));

    await act(async () => {
      fireEvent.click(table.getByRole('button', { name: 'Remove tidy-puffin (left the class)' }));
    });
    await waitFor(() => expect(screen.getByTestId('mentions').textContent).toBe('jolly-teapot: ADHD'));
  });

  it("a curriculum item's new status reaches the sidebar's Curriculum section", async () => {
    const api = mockApi();
    render(
      <>
        <CurriculumCard classId={C1} level={2} api={api as unknown as SessionApi} getEnvelope={envelope} onChanged={() => undefined} />
        <CurriculumSection list={list} activeClassId={C1} api={api as unknown as SessionApi} onOpenClass={() => undefined} onOpenCurriculum={() => undefined} />
      </>,
    );
    // The card comes first, then the sidebar's section.
    await screen.findByRole('combobox', { name: 'Status of LIT 2-16a' });
    const sidebar = within(screen.getAllByRole('region', { name: 'Curriculum' })[1]!);
    expect(await sidebar.findByText('Pick what P7A is working on')).toBeTruthy();
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Status of LIT 2-16a' }), { target: { value: 'now' } });
    });
    expect(await sidebar.findByText('LIT 2-16a')).toBeTruthy();
  });

  it('the class is fetched once for readers that mount together', async () => {
    const api = mockApi();
    render(
      <>
        <PupilTable classId={C1} otherClasses={[]} api={api as unknown as SessionApi} getEnvelope={envelope} onChanged={() => undefined} />
        <CurriculumCard classId={C1} level={2} api={api as unknown as SessionApi} getEnvelope={envelope} onChanged={() => undefined} />
        <Mentions api={api} />
      </>,
    );
    await screen.findByDisplayValue('tidy-puffin');
    expect(api.getClass).toHaveBeenCalledTimes(1);
  });
});
