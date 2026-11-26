import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntryBrief, EntryDetail, PedagogyApi } from '../../api/pedagogy';
import { PedagogyScreen } from './PedagogyScreen';
import { queryFor, NO_FILTERS } from './usePedagogy';

afterEach(cleanup);

const brief = (id: string, type: string, extra: Partial<EntryBrief> = {}): EntryBrief => ({ id, type, title: `Title ${id}`, summary: `Summary ${id}`, status: 'draft', evidence: 'moderate', facets: {}, claims: [], ...extra });
const detail: EntryDetail = {
  entry: {
    id: 'adp-lower',
    type: 'adaptation',
    title: 'Lower reading-level version',
    summary: 'A simpler text.',
    status: 'draft',
    evidence: 'practitioner_wisdom',
    body: 'Keep the **same** questions.',
    facets: { changes_goal: true },
    prerequisites: [],
    risks: ['Lowers expectations if overused.'],
    artefact_recipes: { worksheet: 'Two versions side by side.' },
    reviewed_by: [],
    claims: [{ id: 'clm-lower', text: 'A simpler text can keep the same thinking.', support_type: 'paraphrase', verification: 'located', entry: { id: 'adp-lower', title: 'Lower reading-level version', type: 'adaptation', status: 'draft' }, passages: [] }],
  },
  related: { caution_from: [{ id: 'cau-x', type: 'caution', title: 'Keep expectations high' }] },
  linked_from: {},
};

function fakeApi() {
  const api: Partial<PedagogyApi> = {
    pedagogyInfo: vi.fn(async () => ({ available: true, counts: { sources: 2, passages: 3, entries: 2, claims: 4 }, types: { adaptation: 1, caution: 1 }, facets: { stage: { p7: 2 }, often_relevant_to: { dyslexia: 1 } } })),
    pedagogyEntries: vi.fn(async () => ({ total: 2, truncated: false, entries: [brief('adp-lower', 'adaptation', { changes_goal: true }), brief('cau-x', 'caution', { evidence: 'not_recommended' })] })),
    pedagogyEntry: vi.fn(async () => detail),
  };
  return api;
}

describe('the Pedagogy screen', () => {
  it('says simply what a type is when it is picked, and nothing for All', async () => {
    render(<PedagogyScreen api={fakeApi()} logger={{ log: vi.fn() }} />);
    const types = await screen.findByRole('radiogroup', { name: 'Type' });
    expect(screen.queryByRole('region', { name: 'About this type' })).toBeNull();
    fireEvent.click(within(types).getByRole('radio', { name: /^Adaptations/ }));
    expect(screen.getByRole('region', { name: 'About this type' }).textContent).toMatch(/^An adaptation is /);
    fireEvent.click(within(types).getByRole('radio', { name: /^Cautions/ }));
    expect(screen.getByRole('region', { name: 'About this type' }).textContent).toMatch(/^A caution is /);
    fireEvent.click(within(types).getByRole('radio', { name: 'All' }));
    expect(screen.queryByRole('region', { name: 'About this type' })).toBeNull();
  });

  it('says the library is a draft, lists entries with their evidence, and marks a modification', async () => {
    const api = fakeApi();
    render(<PedagogyScreen api={api} logger={{ log: vi.fn() }} />);
    expect((await screen.findByRole('note')).textContent).toContain('no teacher or specialist has reviewed');
    const list = await screen.findByRole('list', { name: 'Entries' });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2));
    expect(within(list).getByText('Modification')).toBeTruthy();
    expect(within(list).getByText('Not recommended')).toBeTruthy();
    expect(within(list).getAllByText('Draft')).toHaveLength(2);
  });

  it('filters by type and hint, with the hint said to be a hint', async () => {
    const api = fakeApi();
    render(<PedagogyScreen api={api} logger={{ log: vi.fn() }} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Adaptations 1' }));
    fireEvent.change(screen.getByLabelText('Often relevant to'), { target: { value: 'dyslexia' } });
    await waitFor(() => expect(api.pedagogyEntries).toHaveBeenLastCalledWith({ types: ['adaptation'], facets: { often_relevant_to: ['dyslexia'] }, limit: 120 }));
    expect(screen.getByText(/not a rule/)).toBeTruthy();
  });

  it('opens an entry with its claims, recipes, risks and links, and logs it', async () => {
    const api = fakeApi();
    const log = vi.fn();
    render(<PedagogyScreen api={api} logger={{ log }} />);
    const list = await screen.findByRole('list', { name: 'Entries' });
    fireEvent.click(await within(list).findByText('Title adp-lower'));
    const article = await screen.findByRole('article', { name: 'Lower reading-level version' });
    expect(article.textContent).toContain('A simpler text can keep the same thinking.');
    expect(article.textContent).toContain('Two versions side by side.');
    expect(article.textContent).toContain('Lowers expectations if overused.');
    expect(within(article).getByText('Modification')).toBeTruthy();
    expect(log).toHaveBeenCalledWith('pedagogy_open', { entry_id: 'adp-lower' });
    fireEvent.click(within(article).getByRole('button', { name: 'Keep expectations high' }));
    expect(api.pedagogyEntry).toHaveBeenLastCalledWith('cau-x');
  });

  it('names the outcome its ideas are for by code, and says when the sample has none yet', async () => {
    const api = fakeApi();
    api.pedagogyEntries = vi.fn(async () => ({ total: 0, truncated: false, entries: [] }));
    render(<PedagogyScreen api={api} logger={{ log: vi.fn() }} alignsTo={['cur-CUR-lit-2-01a']} alignsLabel="LIT 2-01a" />);
    expect(await screen.findByText('Teaching ideas for LIT 2-01a.')).toBeTruthy();
    expect(await screen.findByText(/The library has nothing for LIT 2-01a yet/)).toBeTruthy();
    expect(screen.queryByText(/cur-CUR/)).toBeNull();
  });

  it('never shows an earlier query’s entries under new filters', async () => {
    const api = fakeApi();
    let answer: (v: unknown) => void = () => undefined;
    const { rerender } = render(<PedagogyScreen api={api} logger={{ log: vi.fn() }} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Title/ })).toHaveLength(2));
    const slow = vi.fn(() => new Promise((r) => (answer = r as never)));
    api.pedagogyEntries = slow as never;
    rerender(<PedagogyScreen api={{ ...api }} logger={{ log: vi.fn() }} alignsTo={['cur-CUR-lit-2-16a']} />);
    await waitFor(() => expect(slow).toHaveBeenCalled());
    expect(screen.queryAllByRole('button', { name: /Title/ })).toHaveLength(0);
    answer({ total: 1, truncated: false, entries: [brief('sig-reciprocal', 'signature_pedagogy')] });
    expect(await screen.findByRole('button', { name: /Title sig-reciprocal/ })).toBeTruthy();
  });

  it('builds the library query from the filters', () => {
    expect(queryFor({ ...NO_FILTERS, stage: 's1', subject: 'history', text: ' source ', alignsTo: ['cur-CUR-soc-3-01a'] })).toEqual({ facets: { stage: ['s1'], subject: ['history'] }, text: 'source', aligns_to: ['cur-CUR-soc-3-01a'], limit: 120 });
  });
});
