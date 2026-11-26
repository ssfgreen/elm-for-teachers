import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CurriculumItem, Pupil, PupilAdaptation } from '@edw/shared';
import { ChatMarkdown } from '../ChatMarkdown';
import { MentionsProvider, type MentionSource } from './context';

afterEach(cleanup);

const pupil = (label: string, extra: Partial<Pupil> = {}): Pupil => ({
  id: `01J00000000000000000000${label.length}`.slice(0, 26).padEnd(26, '0'),
  class_id: '01J0000000000000000000CLAS',
  label,
  number: 1,
  needs: [],
  helps: null,
  working_at: null,
  note: null,
  position: 0,
  created_at: '2026-11-12T00:00:00.000Z',
  archived_at: null,
  ...extra,
});

const tidy = pupil('tidy-puffin', { id: '01J0000000000000000000TIDY', needs: ['Dyslexia', 'Visual stress'], helps: 'Amber overlay', working_at: 'Second level' });
const overlay: PupilAdaptation = {
  id: '01J0000000000000000000ADPT',
  pupil_id: tidy.id,
  entry_id: 'adp-ACC-overlay',
  title: 'Coloured overlay',
  changes_goal: false,
  status: 'trialling',
  overrides: null,
  source_version: null,
  created_at: '2026-11-12T00:00:00.000Z',
  updated_at: '2026-11-12T00:00:00.000Z',
};
const now: CurriculumItem = { id: 'i1', code: 'LIT 2-13a', text: 'I can select and use a range of strategies…', status: 'now' } as CurriculumItem;

function renderWith(text: string, extra: Partial<MentionSource> = {}) {
  const source: MentionSource = { className: 'P7A', pupils: [tidy], adaptations: [overlay], curriculum: [now], ...extra };
  return render(
    <MentionsProvider source={source}>
      <ChatMarkdown text={text} />
    </MentionsProvider>,
  );
}

describe('ChatMarkdown with mentions', () => {
  it("shows a pupil's row of the class's table on hover", () => {
    renderWith('Have tidy-puffin’s amber overlay ready.');
    const name = screen.getByRole('button', { name: 'tidy-puffin: their row in P7A' });
    expect(name.textContent).toBe('tidy-puffin');
    fireEvent.mouseEnter(name);
    const card = screen.getByRole('tooltip');
    expect(card.textContent).toContain('Amber overlay');
    // The hidden needs and working_at are not shown, though the row has them (#243).
    for (const hidden of ['Dyslexia', 'Visual stress', 'Second level', 'Needs', 'Working at']) expect(card.textContent).not.toContain(hidden);
    expect(card.textContent).toContain('Coloured overlay (trialling)');
  });

  it('opens one card at a time', () => {
    renderWith('tidy-puffin and LIT 2-13a', { outcome: async () => null });
    fireEvent.mouseEnter(screen.getByRole('button', { name: /tidy-puffin/ }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: /tidy-puffin/ }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /LIT 2-13a/ }));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip').textContent).toContain('LIT 2-13a');
  });

  it('leaves a word that is not one of the class’s pupils as text', () => {
    renderWith('Ask brave-kettle.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('links a curriculum code to the app’s curriculum, not the PDF the model gave', async () => {
    const outcome = vi.fn(async () => ({ code: 'LIT 2-13a', text: 'I can select and use a range of strategies and resources before I read.', area: 'Literacy and English' }));
    const openCurriculum = vi.fn();
    renderWith('The exercise targets [LIT 2-13a](https://education.gov.scot/media/qhxmxnfq/literacy-english-eo.pdf).', { outcome, openCurriculum });
    expect(document.querySelector('a[href*="education.gov.scot"]')).toBeNull();
    const code = screen.getByRole('button', { name: 'LIT 2-13a in the curriculum' });
    fireEvent.mouseEnter(code);
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('before I read'));
    expect(screen.getByRole('tooltip').textContent).toContain('Now for P7A');
    expect(outcome).toHaveBeenCalledWith('LIT 2-13a');
    fireEvent.click(code);
    expect(openCurriculum).toHaveBeenCalledWith('LIT 2-13a');
  });

  it('keeps a link with other words as an ordinary link', () => {
    renderWith('See [the TRAILS lesson](https://trails.scot/resource/x/).');
    expect(screen.getByRole('link', { name: 'the TRAILS lesson' }).getAttribute('href')).toBe('https://trails.scot/resource/x/');
  });
});

describe('ChatMarkdown without mentions', () => {
  it('renders as before: codes and labels as text, links as links', () => {
    render(<ChatMarkdown text="tidy-puffin: [LIT 2-13a](https://education.gov.scot/x.pdf)" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'LIT 2-13a' }).getAttribute('href')).toBe('https://education.gov.scot/x.pdf');
  });
});
