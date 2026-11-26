import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassCodeAction } from '../../../api/classCode';
import { ApiError } from '../../../api/http';
import type { SessionApi } from '../../../api/participant';
import type { Envelope } from '../../../api/types';
import { attachInteractionTracking } from '../../../events/interactions';
import { ClassCodeCard } from './ClassCodeCard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const C1 = '01JC1ASS0000000000000000L1';
const envelope = () => ({ client_ts: 't', focus_pane: 'none', doc_id: null, thread_id: null }) as Envelope;

/** A deferred answer, so a test can look at the card before the server replies. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockApi(start: string | null) {
  const getClassCode = vi.fn(async () => start);
  const setClassCode = vi.fn<(classId: string, action: ClassCodeAction, env: Envelope) => Promise<string | null>>();
  return { api: { getClassCode, setClassCode } as unknown as SessionApi, getClassCode, setClassCode };
}

const renderCard = async (api: SessionApi, archived = false) => {
  await act(async () => {
    render(<ClassCodeCard classId={C1} archived={archived} api={api} getEnvelope={envelope} />);
  });
  return screen.queryByRole('region', { name: 'Class code' });
};

const codeBox = () => screen.getByRole('textbox', { name: 'Class code' }) as HTMLInputElement;
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('ClassCodeCard', () => {
  it('with no code: offers "Make a code", and shows the code only once the server answers', async () => {
    const m = mockApi(null);
    await renderCard(m.api);
    expect(screen.queryByRole('textbox', { name: 'Class code' })).toBeNull();
    const answer = later<string | null>();
    m.setClassCode.mockReturnValueOnce(answer.promise);
    await click('Make a code');
    expect(m.setClassCode).toHaveBeenCalledWith(C1, 'make', expect.objectContaining({ client_ts: 't' }));
    // Nothing changes before the answer; the button cannot be pressed twice.
    expect(screen.queryByRole('textbox', { name: 'Class code' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Make a code' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer.resolve('ABCD-EFGH'));
    expect(codeBox().value).toBe('ABCD-EFGH');
    expect(codeBox().readOnly).toBe(true);
    expect(screen.getByText(/Pupils go to .*\/r\/join and enter this code/)).toBeTruthy();
  });

  it('a live code: Copy, Renew and Close; the code is in no button, link or label', async () => {
    const m = mockApi('ABCD-EFGH');
    const region = (await renderCard(m.api))!;
    expect(codeBox().value).toBe('ABCD-EFGH');
    for (const name of ['Copy', 'Renew', 'Close']) expect(screen.getByRole('button', { name })).toBeTruthy();
    for (const el of region.querySelectorAll('button, a, label, [aria-label]')) {
      expect(el.textContent ?? '').not.toContain('ABCD-EFGH');
      expect(el.getAttribute('aria-label') ?? '').not.toContain('ABCD-EFGH');
    }
  });

  it('Renew asks first, says the old code stops at once, then shows the new code', async () => {
    const m = mockApi('ABCD-EFGH');
    await renderCard(m.api);
    await click('Renew');
    expect(m.setClassCode).not.toHaveBeenCalled();
    const ask = screen.getByRole('group', { name: 'Renew the code' });
    expect(ask.textContent).toMatch(/old code stops working at once/);
    const answer = later<string | null>();
    m.setClassCode.mockReturnValueOnce(answer.promise);
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Renew' }));
    });
    expect(m.setClassCode).toHaveBeenCalledWith(C1, 'renew', expect.anything());
    expect(codeBox().value).toBe('ABCD-EFGH');
    await act(async () => answer.resolve('JKLM-NPQR'));
    expect(codeBox().value).toBe('JKLM-NPQR');
    expect(screen.queryByRole('group', { name: 'Renew the code' })).toBeNull();
  });

  it('Cancel leaves the code as it is', async () => {
    const m = mockApi('ABCD-EFGH');
    await renderCard(m.api);
    await click('Close');
    await click('Cancel');
    expect(m.setClassCode).not.toHaveBeenCalled();
    expect(codeBox().value).toBe('ABCD-EFGH');
  });

  it('Close, confirmed: back to "Make a code"', async () => {
    const m = mockApi('ABCD-EFGH');
    await renderCard(m.api);
    await click('Close');
    m.setClassCode.mockResolvedValueOnce(null);
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Close the code' })).getByRole('button', { name: 'Close' }));
    });
    expect(m.setClassCode).toHaveBeenCalledWith(C1, 'close', expect.anything());
    expect(screen.queryByRole('textbox', { name: 'Class code' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Make a code' })).toBeTruthy();
  });

  it('a refusal shows its message and leaves the code as it was', async () => {
    const m = mockApi('ABCD-EFGH');
    await renderCard(m.api);
    await click('Renew');
    m.setClassCode.mockRejectedValueOnce(new ApiError(403, JSON.stringify({ error: 'off', code: 'feature_off' })));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Renew the code' })).getByRole('button', { name: 'Renew' }));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/switched off for this workspace/);
    expect(codeBox().value).toBe('ABCD-EFGH');
  });

  it('a refused make says so and still offers "Make a code"', async () => {
    const m = mockApi(null);
    await renderCard(m.api);
    m.setClassCode.mockRejectedValueOnce(new ApiError(409, JSON.stringify({ error: 'x', code: 'class_archived' })));
    await click('Make a code');
    expect(screen.getByRole('alert').textContent).toMatch(/archived/);
    expect((screen.getByRole('button', { name: 'Make a code' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says when the code could not load', async () => {
    const m = mockApi(null);
    m.getClassCode.mockRejectedValueOnce(new Error('down'));
    await renderCard(m.api);
    expect(screen.getByRole('alert').textContent).toMatch(/could not load/);
  });

  it('is not drawn for an archived class, nor without class codes in the api', async () => {
    const m = mockApi('ABCD-EFGH');
    expect(await renderCard(m.api, true)).toBeNull();
    expect(m.getClassCode).not.toHaveBeenCalled();
    cleanup();
    expect(await renderCard({} as SessionApi)).toBeNull();
  });

  it('Copy puts the code on the clipboard; copying and selecting it log nothing carrying the code', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const logged: unknown[] = [];
    const off = attachInteractionTracking({ log: (type, payload) => (logged.push({ type, payload }), 'id') }, document.body, { selectionThrottleMs: 0 });
    try {
      const m = mockApi('ABCD-EFGH');
      await renderCard(m.api);
      await click('Copy');
      expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
      expect(screen.getByRole('status').textContent).toBe('Copied.');
      await act(async () => {
        fireEvent.click(codeBox());
        codeBox().focus();
        codeBox().select();
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((r) => setTimeout(r, 10));
      });
      expect(logged.some((l) => (l as { type: string }).type === 'click')).toBe(true);
      expect(JSON.stringify(logged)).not.toContain('ABCD-EFGH');
    } finally {
      off();
    }
  });
});
