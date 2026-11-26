import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CurriculumItem } from '@edw/shared';
import { CurriculumScreen } from './CurriculumScreen';

afterEach(cleanup);

const T = '2026-11-12T09:00:00.000Z';
const item = (code: string, status: CurriculumItem['status']): CurriculumItem => ({ id: `i-${code}`, class_id: 'C1', framework: 'cfe-eo', code, kind: 'eo', text: `Text of ${code}`, source_version: 'v1', status, created_at: T, updated_at: T });
const option = (code: string, area: string, organiser: string) => ({ code, text: `Outcome ${code}`, area, organiser, sub_organiser: null });

function fakeApi() {
  return {
    getCurriculum: vi.fn(async () => ({
      benchmark_levels: ['second'],
      areas: [
        { id: 'lit', name: 'Literacy and English', organisers: ['Listening and talking', 'Reading'], counts: {} },
        { id: 'num', name: 'Numeracy and mathematics', organisers: ['Number'], counts: {} },
      ],
    })),
    searchCurriculum: vi.fn(async (q: { area?: string; query?: string }) => ({
      version: 'v1',
      total: 2,
      truncated: false,
      options: q.area === 'Numeracy and mathematics' ? [option('MNU 2-02a', 'Numeracy and mathematics', 'Number')] : [option('LIT 2-16a', 'Literacy and English', 'Reading'), option('ENG 2-19a', 'Literacy and English', 'Reading')],
    })),
    curriculumBenchmarks: vi.fn(async () => ({ benchmark_levels: ['second'], benchmarks: [] })),
    getClass: vi.fn(async () => ({ class: {} as never, year_group: null, pupils: [], curriculum: [item('LIT 2-16a', 'now')] })),
  };
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
}

describe('the Curriculum screen', () => {
  it('browses by area and organiser at the class’s level, marking what the class is on', async () => {
    const api = fakeApi();
    render(<CurriculumScreen api={api} cls={{ id: 'C1', name: 'P7A', level: 2 }} onIdeas={vi.fn()} />);
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Curriculum' })).toBeTruthy();
    expect(api.searchCurriculum).toHaveBeenLastCalledWith({ level: 2 });
    const outcomes = within(screen.getByRole('region', { name: 'Outcomes' }));
    const card = outcomes.getByRole('article', { name: 'LIT 2-16a' });
    expect(within(card).getByText('P7A: Now')).toBeTruthy();
    expect(within(outcomes.getByRole('article', { name: 'ENG 2-19a' })).queryByText(/P7A:/)).toBeNull();
    // What the class is on, at the top.
    expect(within(screen.getByRole('region', { name: 'P7A is working on' })).getByText('LIT 2-16a')).toBeTruthy();

    const areas = within(screen.getByRole('navigation', { name: 'Curriculum areas' }));
    fireEvent.click(areas.getByRole('button', { name: 'Numeracy and mathematics' }));
    await settle();
    expect(api.searchCurriculum).toHaveBeenLastCalledWith({ level: 2, area: 'Numeracy and mathematics' });
    fireEvent.click(areas.getByRole('button', { name: 'Number' }));
    await settle();
    expect(api.searchCurriculum).toHaveBeenLastCalledWith({ level: 2, area: 'Numeracy and mathematics', organiser: 'Number' });
    expect(within(screen.getByRole('region', { name: 'Outcomes' })).getByRole('article', { name: 'MNU 2-02a' })).toBeTruthy();
  });

  it('opens on an outcome, and Ideas goes to the pedagogy that aligns to it', async () => {
    const api = fakeApi();
    const onIdeas = vi.fn();
    render(<CurriculumScreen api={api} cls={null} code="LIT 2-16a" onIdeas={onIdeas} />);
    await settle();
    expect((screen.getByRole('searchbox', { name: 'Search the curriculum' }) as HTMLInputElement).value).toBe('LIT 2-16a');
    expect(api.searchCurriculum).toHaveBeenLastCalledWith({ query: 'LIT 2-16a' });
    const card = within(screen.getByRole('article', { name: 'LIT 2-16a' }));
    fireEvent.click(card.getByRole('button', { name: 'Ideas for LIT 2-16a' }));
    expect(onIdeas).toHaveBeenCalledWith('LIT 2-16a');
  });
});
