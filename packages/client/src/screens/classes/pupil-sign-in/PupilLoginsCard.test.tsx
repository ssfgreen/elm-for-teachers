import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionApi } from '../../../api/participant';
import type { MadeLogin, PupilLogin, PupilLoginsApi } from '../../../api/pupilLogins';
import type { Envelope } from '../../../api/types';
import { attachInteractionTracking } from '../../../events/interactions';
import { controlAt } from '../../../events/interactions/target';
import { PupilLoginsCard } from './PupilLoginsCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelectorAll('iframe').forEach((f) => f.remove());
});

/** jsdom has no print: stop the slips frame's load before the card prints, and count the loads. */
function noPrint() {
  const loads = { n: 0 };
  const make = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, o?: ElementCreationOptions) => {
    const el = make(tag, o);
    if (tag === 'iframe') el.addEventListener('load', (e) => (loads.n++, e.stopImmediatePropagation()), { capture: true });
    return el;
  });
  return loads;
}

const C1 = '01JC1ASS0000000000000000L1';
const envelope = () => ({ client_ts: 't', focus_pane: 'none', doc_id: null, thread_id: null }) as Envelope;
const listed = (id: string, over: Partial<PupilLogin> = {}): PupilLogin => ({ id, username: `kind-otter-${id}`, used: false, label: null, locked: false, ...over });
const MADE: MadeLogin[] = [
  { id: 'N1', username: 'brave-heron-71', password: 'apple-river-93' },
  { id: 'N2', username: 'quiet-fox-18', password: 'stone-lark-55' },
];
const SECRETS = MADE.flatMap((l) => [l.username, l.password]);
const RENEWED: MadeLogin = { id: 'L3', username: 'kind-otter-L3', password: 'maple-acorn-418' };

function mockApi(start: PupilLogin[] = [], { codes = true } = {}) {
  const listPupilLogins = vi.fn<PupilLoginsApi['listPupilLogins']>(async () => start);
  const makePupilLogins = vi.fn<PupilLoginsApi['makePupilLogins']>(async () => MADE);
  const deletePupilLogin = vi.fn<PupilLoginsApi['deletePupilLogin']>(async () => undefined);
  const newPupilPassword = vi.fn<PupilLoginsApi['newPupilPassword']>(async () => RENEWED);
  const classCode = codes ? { getClassCode: vi.fn(async () => 'ABCD-EFGH'), setClassCode: vi.fn() } : {};
  const api = { listPupilLogins, makePupilLogins, deletePupilLogin, newPupilPassword, ...classCode } as unknown as SessionApi;
  return { api, listPupilLogins, makePupilLogins, deletePupilLogin, newPupilPassword };
}

const renderCard = async (api: SessionApi, archived = false) => {
  await act(async () => {
    render(<PupilLoginsCard classId={C1} name="P7 Birch" archived={archived} api={api} getEnvelope={envelope} />);
  });
  return screen.queryByRole('region', { name: 'Pupil logins' });
};
const click = async (name: string, within_: HTMLElement = document.body) => {
  await act(async () => {
    fireEvent.click(within(within_).getByRole('button', { name }));
  });
};
const howMany = () => screen.getByRole('spinbutton', { name: 'How many' }) as HTMLInputElement;
const type = (value: string) => act(() => void fireEvent.change(howMany(), { target: { value } }));

describe('PupilLoginsCard', () => {
  it('is drawn while pupils can join, with or without logins', async () => {
    expect(await renderCard(mockApi().api)).not.toBeNull();
    expect(screen.getByText('No logins yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make 1 login' })).toBeTruthy();
  });

  it('with pupils off or the class archived: drawn only when the class has logins, and with no Make', async () => {
    expect(await renderCard(mockApi([], { codes: false }).api)).toBeNull();
    cleanup();
    expect(await renderCard(mockApi([]).api, true)).toBeNull();
    cleanup();
    expect(await renderCard(mockApi([listed('L1')], { codes: false }).api)).not.toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'How many' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    cleanup();
    expect(await renderCard(mockApi([listed('L1')]).api, true)).not.toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'How many' })).toBeNull();
  });

  it('is not drawn without pupil logins in the api (the make kit)', async () => {
    expect(await renderCard({} as SessionApi)).toBeNull();
    const codesOnly = { getClassCode: vi.fn(), setClassCode: vi.fn() } as unknown as SessionApi;
    expect(await renderCard(codesOnly)).toBeNull();
  });

  it('names Make by the count, and turns it off outside 1 to 40', async () => {
    await renderCard(mockApi().api);
    type('12');
    expect(screen.getByRole('button', { name: 'Make 12 logins' })).toBeTruthy();
    for (const bad of ['0', '41', '', '2.5']) {
      type(bad);
      expect((screen.getByRole('button', { name: /^Make/ }) as HTMLButtonElement).disabled).toBe(true);
    }
    type('40');
    expect((screen.getByRole('button', { name: 'Make 40 logins' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a make shows the new logins once; Done asks first, then they are gone', async () => {
    const m = mockApi();
    await renderCard(m.api);
    type('2');
    m.listPupilLogins.mockResolvedValueOnce([listed('N1'), listed('N2')]);
    await click('Make 2 logins');
    expect(m.makePupilLogins).toHaveBeenCalledWith(C1, 2, expect.objectContaining({ client_ts: 't' }));
    const panel = screen.getByRole('group', { name: 'New logins' });
    const values = within(panel).getAllByRole('textbox').map((b) => (b as HTMLInputElement).value);
    expect(values).toEqual(SECRETS);
    expect(panel.textContent).toContain('These passwords are shown only now.');
    expect(screen.queryByRole('spinbutton', { name: 'How many' })).toBeNull();
    await click('Done', panel);
    expect(screen.getByRole('group', { name: 'Hide the passwords' }).textContent).toContain('Hide the passwords? They cannot be shown again.');
    await click('Done', screen.getByRole('group', { name: 'Hide the passwords' }));
    expect(screen.queryByRole('group', { name: 'New logins' })).toBeNull();
    expect(document.body.innerHTML).not.toContain('apple-river-93');
    expect(screen.getByRole('spinbutton', { name: 'How many' })).toBeTruthy();
  });

  it('Print slips writes the slips into a hidden iframe, which goes on Done', async () => {
    noPrint();
    await renderCard(mockApi().api);
    type('2');
    await click('Make 2 logins');
    await click('Print slips');
    const frame = document.querySelector('iframe')!;
    expect(frame.title).toBe('Login slips');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    const slips = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    expect(slips.querySelectorAll('.slip')).toHaveLength(2);
    for (const s of SECRETS) expect(frame.srcdoc).toContain(s);
    expect(frame.srcdoc).toContain('P7 Birch');
    expect(frame.srcdoc).not.toContain('ABCD-EFGH');
    await click('Done');
    await click('Done', screen.getByRole('group', { name: 'Hide the passwords' }));
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('lists unused, used and locked logins; Delete only on an unused one, on a second click', async () => {
    const m = mockApi([listed('L1'), listed('L2', { used: true, label: 'Pupil 3' }), listed('L3', { used: true, label: 'Pupil 4', locked: true })]);
    await renderCard(m.api);
    const rows = within(screen.getByRole('list', { name: 'Logins' })).getAllByRole('listitem');
    expect(rows.map((r) => (within(r).getByRole('textbox', { name: 'Username' }) as HTMLInputElement).value)).toEqual(['kind-otter-L1', 'kind-otter-L2', 'kind-otter-L3']);
    expect(rows[0]!.textContent).toContain('Not used yet');
    expect(rows[1]!.textContent).toContain('Pupil 3');
    expect(rows[2]!.textContent).toContain('Locked');
    expect(rows[2]!.textContent).toContain('Five wrong passwords in a row. A new password will unlock it.');
    expect(rows.map((r) => within(r).queryByRole('button', { name: 'Delete' }) !== null)).toEqual([true, false, false]);

    await click('Delete', rows[0]!);
    expect(m.deletePupilLogin).not.toHaveBeenCalled();
    const ask = screen.getByRole('group', { name: 'Delete the login' });
    expect(ask.textContent).toContain('Delete this login? Its slip will stop working.');
    m.listPupilLogins.mockResolvedValueOnce([listed('L2', { used: true, label: 'Pupil 3' })]);
    await click('Delete', ask);
    expect(m.deletePupilLogin).toHaveBeenCalledWith(C1, 'L1');
    expect(within(screen.getByRole('list', { name: 'Logins' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('New password on used, unused and locked rows: two clicks, one request, shown once titled "New password"', async () => {
    const m = mockApi([listed('L1'), listed('L2', { used: true, label: 'Pupil 3' }), listed('L3', { used: true, label: 'Pupil 4', locked: true })]);
    await renderCard(m.api);
    const rows = within(screen.getByRole('list', { name: 'Logins' })).getAllByRole('listitem');
    const buttons = rows.map((r) => within(r).getByRole('button', { name: 'New password' }));
    for (const [i, b] of buttons.entries()) {
      const box = within(rows[i]!).getByRole('textbox', { name: 'Username' });
      expect(b.getAttribute('aria-describedby')).toBe(box.id);
    }

    await click('New password', rows[2]!);
    expect(m.newPupilPassword).not.toHaveBeenCalled();
    const ask = screen.getByRole('group', { name: 'New password' });
    expect(ask.textContent).toContain('Make a new password? The old one stops working at once and the pupil is signed out.');
    await click('Cancel', ask);
    expect(screen.queryByRole('group', { name: 'New password' })).toBeNull();

    await click('New password', rows[2]!);
    m.listPupilLogins.mockResolvedValueOnce([listed('L1'), listed('L2', { used: true, label: 'Pupil 3' }), listed('L3', { used: true, label: 'Pupil 4' })]);
    await click('Make new password', screen.getByRole('group', { name: 'New password' }));
    expect(m.newPupilPassword).toHaveBeenCalledTimes(1);
    expect(m.newPupilPassword).toHaveBeenCalledWith(C1, 'L3', expect.objectContaining({ client_ts: 't' }));
    const panel = screen.getByRole('group', { name: 'New password' });
    expect(within(panel).getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual([RENEWED.username, RENEWED.password]);
    expect(within(panel).getByRole('button', { name: 'Print slips' })).toBeTruthy();
    // While a password is on show, no row offers another, and the list no longer says Locked.
    expect(screen.queryAllByRole('button', { name: 'New password' })).toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Logins' })).queryByText('Locked')).toBeNull();

    await click('Done', panel);
    await click('Done', screen.getByRole('group', { name: 'Hide the passwords' }));
    expect(document.body.innerHTML).not.toContain(RENEWED.password);
    expect(screen.getAllByRole('button', { name: 'New password' })).toHaveLength(3);
  });

  it('New password asked, then Make: the question goes and the new logins stay on show', async () => {
    const m = mockApi([listed('L1')]);
    await renderCard(m.api);
    await click('New password');
    expect(screen.getByRole('group', { name: 'New password' })).toBeTruthy();
    type('2');
    await click('Make 2 logins');
    expect(screen.queryByRole('button', { name: 'Make new password' })).toBeNull();
    expect(screen.getByRole('group', { name: 'New logins' })).toBeTruthy();
    expect(m.newPupilPassword).not.toHaveBeenCalled();
  });

  it('no New password while pupils cannot join', async () => {
    await renderCard(mockApi([listed('L1', { used: true, label: 'Pupil 1', locked: true })], { codes: false }).api);
    expect(screen.queryByRole('button', { name: 'New password' })).toBeNull();
    cleanup();
    await renderCard(mockApi([listed('L1', { used: true, label: 'Pupil 1' })]).api, true);
    expect(screen.queryByRole('button', { name: 'New password' })).toBeNull();
  });

  it('a refused New password shows its words', async () => {
    const m = mockApi([listed('L1')]);
    m.newPupilPassword.mockRejectedValueOnce(new Error('offline'));
    await renderCard(m.api);
    await click('New password');
    await click('Make new password');
    expect(screen.getByRole('alert').textContent).toBe('The new password could not be made. Try again.');
    expect(screen.queryByRole('group', { name: 'New password' })).toBeNull();
  });

  it('with logins made: no username or password in a button, label, aria-label, title, data-track or id', async () => {
    await renderCard(mockApi([listed('L1')]).api);
    type('2');
    await click('Make 2 logins');
    const region = screen.getByRole('region', { name: 'Pupil logins' });
    const secrets = [...SECRETS, 'kind-otter-L1'];
    for (const el of region.querySelectorAll('*')) {
      const said = [
        el.matches('button, a, label, h2, h3, span, p') ? el.textContent : '',
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.getAttribute('data-track'),
        el.id,
      ].join(' ');
      for (const s of secrets) expect(said).not.toContain(s);
    }
    for (const box of region.querySelectorAll('input[readonly]')) {
      const c = controlAt(box);
      expect(c?.label === 'Username' || c?.label === 'Password').toBe(true);
    }
  });

  it('a click on each box and a selection in the card log neither username nor password', async () => {
    const logged: unknown[] = [];
    const off = attachInteractionTracking({ log: (type, payload) => (logged.push({ type, payload }), 'id') }, document.body, { selectionThrottleMs: 0 });
    try {
      await renderCard(mockApi([listed('L1')]).api);
      type('2');
      await click('Make 2 logins');
      const region = screen.getByRole('region', { name: 'Pupil logins' });
      await act(async () => {
        for (const box of region.querySelectorAll('input[readonly]')) {
          fireEvent.click(box);
          (box as HTMLInputElement).focus();
          (box as HTMLInputElement).select();
          document.dispatchEvent(new Event('selectionchange'));
        }
        const range = document.createRange();
        range.selectNodeContents(region);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(logged.filter((l) => (l as { type: string }).type === 'click').length).toBeGreaterThanOrEqual(5);
      const text = JSON.stringify(logged);
      for (const s of [...SECRETS, 'kind-otter-L1']) expect(text).not.toContain(s);
    } finally {
      off();
    }
  });
});
