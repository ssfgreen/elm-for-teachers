import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/http';
import type { MadeLogin, PupilLogin, PupilLoginsApi } from '../../../api/pupilLogins';
import type { Envelope } from '../../../api/types';
import { usePupilLogins } from './usePupilLogins';

afterEach(cleanup);

const envelope = () => ({ client_ts: 't', focus_pane: 'none', doc_id: null, thread_id: null }) as Envelope;
const listed = (id: string, over: Partial<PupilLogin> = {}): PupilLogin => ({ id, username: `user-${id}`, used: false, label: null, locked: false, ...over });
const made: MadeLogin[] = [
  { id: 'L2', username: 'user-L2', password: 'pass-two' },
  { id: 'L3', username: 'user-L3', password: 'pass-three' },
];

const renewed: MadeLogin = { id: 'L1', username: 'user-L1', password: 'pass-new' };

function later<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function mockApi(start: PupilLogin[] = [listed('L1')]) {
  const listPupilLogins = vi.fn<PupilLoginsApi['listPupilLogins']>(async () => start);
  const makePupilLogins = vi.fn<PupilLoginsApi['makePupilLogins']>(async () => made);
  const deletePupilLogin = vi.fn<PupilLoginsApi['deletePupilLogin']>(async () => undefined);
  const newPupilPassword = vi.fn<PupilLoginsApi['newPupilPassword']>(async () => renewed);
  const api: PupilLoginsApi = { listPupilLogins, makePupilLogins, deletePupilLogin, newPupilPassword };
  return { api, listPupilLogins, makePupilLogins, deletePupilLogin, newPupilPassword };
}

async function mount(api: PupilLoginsApi, classId = 'C1') {
  const h = renderHook(({ id }) => usePupilLogins(api, id, envelope), { initialProps: { id: classId } });
  await act(async () => {});
  return h;
}

describe('usePupilLogins', () => {
  it('loads once per class', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    expect(h.result.current.status).toBe('ready');
    expect(h.result.current.logins.map((l) => l.id)).toEqual(['L1']);
    h.rerender({ id: 'C1' });
    await act(async () => {});
    expect(m.listPupilLogins).toHaveBeenCalledTimes(1);
    h.rerender({ id: 'C2' });
    await act(async () => {});
    expect(m.listPupilLogins).toHaveBeenLastCalledWith('C2');
    expect(m.listPupilLogins).toHaveBeenCalledTimes(2);
  });

  it('a make keeps the passwords and reloads the list', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    m.listPupilLogins.mockResolvedValueOnce([listed('L1'), listed('L2'), listed('L3')]);
    await act(() => h.result.current.make(2));
    expect(m.makePupilLogins).toHaveBeenCalledWith('C1', 2, expect.objectContaining({ client_ts: 't' }));
    expect(h.result.current.made).toEqual(made);
    expect(h.result.current.logins.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    expect(m.listPupilLogins).toHaveBeenCalledTimes(2);
  });

  it('Done needs two clicks and drops the passwords', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    await act(() => h.result.current.make(2));
    act(() => h.result.current.askDone());
    expect(h.result.current.confirmingDone).toBe(true);
    expect(h.result.current.made).toEqual(made);
    act(() => h.result.current.cancelDone());
    expect(h.result.current.made).toEqual(made);
    act(() => h.result.current.askDone());
    act(() => h.result.current.confirmDone());
    expect(h.result.current.made).toBeNull();
    expect(h.result.current.confirmingDone).toBe(false);
  });

  it('another class drops the passwords, and so does unmounting', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    await act(() => h.result.current.make(2));
    h.rerender({ id: 'C2' });
    await act(async () => {});
    expect(h.result.current.made).toBeNull();
    await act(() => h.result.current.make(2));
    expect(h.result.current.made).toEqual(made);
    h.unmount();
    // A fresh mount (the card keyed by class) starts with none.
    const again = await mount(m.api, 'C2');
    expect(again.result.current.made).toBeNull();
  });

  it('a Make still out when the class changes does not show its passwords on the new class', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    const answer = later<MadeLogin[]>();
    m.makePupilLogins.mockReturnValueOnce(answer.promise);
    let first!: Promise<void>;
    act(() => {
      first = h.result.current.make(2);
    });
    h.rerender({ id: 'C2' });
    await act(async () => {
      answer.resolve(made);
      await first;
    });
    expect(h.result.current.made).toBeNull();
    expect(m.listPupilLogins).toHaveBeenLastCalledWith('C2');
  });

  it('delete needs two clicks, then reloads the list', async () => {
    const m = mockApi([listed('L1'), listed('L2')]);
    const h = await mount(m.api);
    act(() => h.result.current.askDelete('L1'));
    expect(m.deletePupilLogin).not.toHaveBeenCalled();
    expect(h.result.current.confirmingDelete).toBe('L1');
    m.listPupilLogins.mockResolvedValueOnce([listed('L2')]);
    await act(() => h.result.current.confirmDelete());
    expect(m.deletePupilLogin).toHaveBeenCalledWith('C1', 'L1');
    expect(h.result.current.logins.map((l) => l.id)).toEqual(['L2']);
    expect(h.result.current.confirmingDelete).toBeNull();
  });

  it('a refusal leaves the list as it was and shows its message', async () => {
    const m = mockApi([listed('L1', { used: true, label: 'Pupil 1' })]);
    const h = await mount(m.api);
    m.deletePupilLogin.mockRejectedValueOnce(new ApiError(409, JSON.stringify({ error: 'used', code: 'login_used' })));
    act(() => h.result.current.askDelete('L1'));
    await act(() => h.result.current.confirmDelete());
    expect(h.result.current.problem).toMatch(/Remove the pupil under Pupils who joined instead/);
    expect(h.result.current.logins.map((l) => l.id)).toEqual(['L1']);
    m.makePupilLogins.mockRejectedValueOnce(new ApiError(409, JSON.stringify({ error: 'archived', code: 'class_archived' })));
    await act(() => h.result.current.make(3));
    expect(h.result.current.problem).toMatch(/archived/);
    expect(h.result.current.made).toBeNull();
    expect(m.listPupilLogins).toHaveBeenCalledTimes(1);
  });

  it('counts the first load as the request that is out: no Make until it answers, and a late answer cannot overwrite a newer list', async () => {
    const m = mockApi();
    const first = later<PupilLogin[]>();
    m.listPupilLogins.mockReturnValueOnce(first.promise);
    const h = renderHook(() => usePupilLogins(m.api, 'C1', envelope));
    expect(h.result.current.busy).toBe(true);
    await act(() => h.result.current.make(2));
    expect(m.makePupilLogins).not.toHaveBeenCalled();
    await act(async () => first.resolve([listed('L1')]));
    expect(h.result.current.busy).toBe(false);
    m.listPupilLogins.mockResolvedValueOnce([listed('L1'), listed('N1'), listed('N2')]);
    await act(() => h.result.current.make(2));
    expect(h.result.current.logins.map((l) => l.id)).toEqual(['L1', 'N1', 'N2']);
  });

  it('a request still out when the class changes does not free the next class’s request', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    const answer = later<MadeLogin[]>();
    m.makePupilLogins.mockReturnValueOnce(answer.promise);
    let old!: Promise<void>;
    act(() => {
      old = h.result.current.make(2);
    });
    const load = later<PupilLogin[]>();
    m.listPupilLogins.mockReturnValueOnce(load.promise);
    h.rerender({ id: 'C2' });
    await act(async () => {
      answer.resolve(made);
      await old;
    });
    // C2's first load is still out: it stays the request that is out.
    expect(h.result.current.busy).toBe(true);
    await act(() => h.result.current.make(2));
    expect(m.makePupilLogins).toHaveBeenCalledTimes(1);
    await act(async () => load.resolve([]));
    expect(h.result.current.busy).toBe(false);
  });

  it('sends one request at a time', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    const answer = later<MadeLogin[]>();
    m.makePupilLogins.mockReturnValueOnce(answer.promise);
    let first!: Promise<void>;
    act(() => {
      first = h.result.current.make(2);
      void h.result.current.make(5);
    });
    expect(h.result.current.busy).toBe(true);
    act(() => h.result.current.askDelete('L1'));
    await act(async () => {
      void h.result.current.confirmDelete();
    });
    expect(m.makePupilLogins).toHaveBeenCalledTimes(1);
    expect(m.deletePupilLogin).not.toHaveBeenCalled();
    await act(async () => {
      answer.resolve(made);
      await first;
    });
    expect(h.result.current.busy).toBe(false);
    expect(h.result.current.made).toEqual(made);
  });

  it('New password takes two clicks and one request, shows that one login, and reloads the list', async () => {
    const m = mockApi([listed('L1', { used: true, label: 'Pupil 1', locked: true })]);
    const h = await mount(m.api);
    act(() => h.result.current.askNewPassword('L1'));
    expect(h.result.current.confirmingNewPassword).toBe('L1');
    expect(m.newPupilPassword).not.toHaveBeenCalled();
    act(() => h.result.current.cancelNewPassword());
    expect(h.result.current.confirmingNewPassword).toBeNull();
    act(() => h.result.current.askNewPassword('L1'));
    m.listPupilLogins.mockResolvedValueOnce([listed('L1', { used: true, label: 'Pupil 1' })]);
    await act(async () => {
      void h.result.current.confirmNewPassword();
      void h.result.current.confirmNewPassword();
    });
    expect(m.newPupilPassword).toHaveBeenCalledTimes(1);
    expect(m.newPupilPassword).toHaveBeenCalledWith('C1', 'L1', expect.objectContaining({ client_ts: 't' }));
    expect(h.result.current.made).toEqual([renewed]);
    expect(h.result.current.madeBy).toBe('new-password');
    expect(h.result.current.confirmingNewPassword).toBeNull();
    expect(h.result.current.logins[0]!.locked).toBe(false);
    act(() => h.result.current.askDone());
    act(() => h.result.current.confirmDone());
    expect(h.result.current.made).toBeNull();
    // A Make afterwards is titled as one again.
    await act(() => h.result.current.make(2));
    expect(h.result.current.madeBy).toBe('make');
  });

  it('a Make while a New password is asked puts the question away, and a late confirm cannot replace the batch', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    act(() => h.result.current.askNewPassword('L1'));
    await act(() => h.result.current.make(2));
    expect(h.result.current.confirmingNewPassword).toBeNull();
    // Even if a confirm still comes through while the batch is on show, it does nothing.
    act(() => h.result.current.askNewPassword('L1'));
    await act(() => h.result.current.confirmNewPassword());
    expect(m.newPupilPassword).not.toHaveBeenCalled();
    expect(h.result.current.made).toEqual(made);
    expect(h.result.current.madeBy).toBe('make');
  });

  it('asking for a new password puts away a Delete being asked, and the other way round', async () => {
    const m = mockApi([listed('L1'), listed('L2')]);
    const h = await mount(m.api);
    act(() => h.result.current.askDelete('L1'));
    act(() => h.result.current.askNewPassword('L2'));
    expect([h.result.current.confirmingDelete, h.result.current.confirmingNewPassword]).toEqual([null, 'L2']);
    act(() => h.result.current.askDelete('L1'));
    expect([h.result.current.confirmingDelete, h.result.current.confirmingNewPassword]).toEqual(['L1', null]);
  });

  it('a refused New password shows its words and changes nothing', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    m.newPupilPassword.mockRejectedValueOnce(new ApiError(409, JSON.stringify({ error: 'archived', code: 'class_archived' })));
    act(() => h.result.current.askNewPassword('L1'));
    await act(() => h.result.current.confirmNewPassword());
    expect(h.result.current.problem).toBe('This class is archived, so its passwords cannot change.');
    expect(h.result.current.made).toBeNull();
    expect(m.listPupilLogins).toHaveBeenCalledTimes(1);
  });

  it('the new password goes on a class change and on unmount, and a late answer for an older class is dropped', async () => {
    const m = mockApi();
    const h = await mount(m.api);
    act(() => h.result.current.askNewPassword('L1'));
    await act(() => h.result.current.confirmNewPassword());
    expect(h.result.current.made).toEqual([renewed]);
    h.rerender({ id: 'C2' });
    await act(async () => {});
    expect(h.result.current.made).toBeNull();

    const answer = later<MadeLogin>();
    m.newPupilPassword.mockReturnValueOnce(answer.promise);
    act(() => h.result.current.askNewPassword('L1'));
    let old!: Promise<void>;
    act(() => {
      old = h.result.current.confirmNewPassword();
    });
    h.rerender({ id: 'C3' });
    await act(async () => {
      answer.resolve(renewed);
      await old;
    });
    expect(h.result.current.made).toBeNull();
    expect(h.result.current.confirmingNewPassword).toBeNull();
    h.unmount();
    expect((await mount(m.api, 'C3')).result.current.made).toBeNull();
  });
});
