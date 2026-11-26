/** The "Pupils who joined" card (#220): the list and count, Remove on a second click, one at a time, and research data. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassMember } from '../../../api/classMembers';
import { ApiError } from '../../../api/http';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { attachInteractionTracking } from '../../../events/interactions';
import { JoinedPupilsCard } from './JoinedPupilsCard';

afterEach(cleanup);

const C1 = '01JC1ASS0000000000000000L1';
const envelope = () => ({ client_ts: 't', focus_pane: 'none', doc_id: null, thread_id: null }) as Envelope;
const M = (n: number): ClassMember => ({ id: `01JMEMBER00000000000000M${n}`, label: `Pupil ${n}`, provider: 'google', joined_on: '2026-11-24' });

function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An api whose list is the "server's": Remove takes the member out of it. */
function mockApi(start: ClassMember[], opts: { code?: boolean } = {}) {
  let server = [...start];
  const listClassMembers = vi.fn(async () => [...server]);
  const removeClassMember = vi.fn(async (_c: string, id: string) => {
    server = server.filter((m) => m.id !== id);
  });
  const code = opts.code === false ? {} : { getClassCode: vi.fn(async () => null), setClassCode: vi.fn() };
  return { api: { listClassMembers, removeClassMember, ...code } as unknown as SessionApi, listClassMembers, removeClassMember };
}

const renderCard = async (api: SessionApi, archived = false) => {
  await act(async () => {
    render(<JoinedPupilsCard classId={C1} archived={archived} api={api} getEnvelope={envelope} />);
  });
  return screen.queryByRole('region', { name: 'Pupils who joined' });
};
const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent);
const removeButtons = () => screen.getAllByRole('button', { name: 'Remove' }) as HTMLButtonElement[];
const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

describe('JoinedPupilsCard', () => {
  it('lists the pupils with the count, provider and day', async () => {
    await renderCard(mockApi([M(1), M(2)]).api);
    expect(screen.getByText('2 pupils have joined.')).toBeTruthy();
    expect(rows()).toEqual(['Pupil 1GoogleJoined 24 Nov 2026Remove', 'Pupil 2GoogleJoined 24 Nov 2026Remove']);
  });

  it('an empty class says so while pupils can join; with no way in, there is no card', async () => {
    const region = await renderCard(mockApi([]).api);
    expect(within(region!).getByText('No pupils have joined yet.')).toBeTruthy();
    cleanup();
    expect(await renderCard(mockApi([], { code: false }).api)).toBeNull();
    cleanup();
    expect(await renderCard(mockApi([]).api, true)).toBeNull();
  });

  it('is drawn with pupils switched off or the class archived when someone has joined', async () => {
    expect(await renderCard(mockApi([M(1)], { code: false }).api)).not.toBeNull();
    cleanup();
    expect(await renderCard(mockApi([M(1)]).api, true)).not.toBeNull();
  });

  it('no card without the members calls (the make kit)', async () => {
    expect(await renderCard({} as SessionApi)).toBeNull();
  });

  it('Remove needs a second click, and the list is then the server’s', async () => {
    const m = mockApi([M(1), M(2)]);
    await renderCard(m.api);
    await click(removeButtons()[0]!);
    expect(m.removeClassMember).not.toHaveBeenCalled();
    expect(screen.getByText(/Renew the code to stop them joining again/)).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Renew the code/)).toBeNull();

    await click(removeButtons()[0]!);
    await click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove' }));
    expect(m.removeClassMember).toHaveBeenCalledWith(C1, M(1).id, expect.objectContaining({ client_ts: 't' }));
    expect(rows()).toEqual(['Pupil 2GoogleJoined 24 Nov 2026Remove']);
    expect(screen.getByText('1 pupil has joined.')).toBeTruthy();
  });

  it('every button is off while a Remove is with the server, and the row stays until it answers', async () => {
    const m = mockApi([M(1), M(2)]);
    const answer = later<void>();
    m.removeClassMember.mockReturnValueOnce(answer.promise);
    await renderCard(m.api);
    await click(removeButtons()[0]!);
    await click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove' }));
    expect(removeButtons().every((b) => b.disabled)).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(rows()).toHaveLength(2);
    await act(async () => answer.resolve());
    expect(rows()).toHaveLength(2); // the mock's server still has both: the list is what it says
    expect(removeButtons().every((b) => !b.disabled)).toBe(true);
  });

  it('a Remove that worked but whose list could not reload says so', async () => {
    const m = mockApi([M(1), M(2)]);
    await renderCard(m.api);
    m.listClassMembers.mockRejectedValueOnce(new Error('offline'));
    await click(removeButtons()[0]!);
    await click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove' }));
    expect(m.removeClassMember).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Removed, but the list could not reload\. Reload the page\./);
  });

  it('a refusal says so and leaves the list', async () => {
    const m = mockApi([M(1)]);
    m.removeClassMember.mockRejectedValueOnce(new ApiError(500, JSON.stringify({ error: 'boom' })));
    await renderCard(m.api);
    await click(removeButtons()[0]!);
    await click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('alert').textContent).toMatch(/could not be removed/);
    expect(rows()).toEqual(['Pupil 1GoogleJoined 24 Nov 2026Remove']);
  });

  it('Remove is named "Remove" only: the row through aria-describedby, and no member id in any label, title, data-track or element id', async () => {
    const logged: unknown[] = [];
    const off = attachInteractionTracking({ log: (type, payload) => (logged.push({ type, payload }), 'id') }, document.body, { selectionThrottleMs: 0 });
    try {
      const m = mockApi([M(1), M(2)]);
      const region = await renderCard(m.api);
      const b = removeButtons()[0]!;
      expect(b.getAttribute('aria-label')).toBeNull();
      expect(document.getElementById(b.getAttribute('aria-describedby')!)!.textContent).toBe('Pupil 1');
      await click(b);
      await click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove' }));
      const clicks = logged.filter((l) => (l as { type: string }).type === 'click').map((l) => (l as { payload: { control?: { label?: string } } }).payload);
      expect(clicks.map((c) => c.control?.label)).toEqual(['Remove', 'Remove']);
      expect(JSON.stringify(clicks)).not.toContain('Pupil 1');
      for (const s of [M(1).id, M(2).id]) {
        expect(JSON.stringify(logged)).not.toContain(s);
        for (const attr of ['aria-label', 'title', 'data-track', 'aria-labelledby', 'id']) {
          expect(region!.querySelector(`[${attr}*="${s}"]`)).toBeNull();
        }
      }
    } finally {
      off();
    }
  });
});
