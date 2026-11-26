import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPendingDraft, parseAddDraftHash, takeAddDraftLink, takePendingDraft } from './draftLink';

const ADDRESS = 'https://studio.example/d/abc123XYZ';

function fakeWindow(hash: string) {
  const loc = { hash, pathname: '/w', search: '?x=1' } as Location;
  const history = { state: { idx: 3 }, replaceState: vi.fn() } as unknown as History;
  return { loc, history };
}

afterEach(() => {
  takePendingDraft();
});

describe('the studio link', () => {
  it('reads the address from an #add-draft= hash, encoded or not', () => {
    expect(parseAddDraftHash(`#add-draft=${ADDRESS}`)).toBe(ADDRESS);
    expect(parseAddDraftHash(`#add-draft=${encodeURIComponent(ADDRESS)}`)).toBe(ADDRESS);
    expect(parseAddDraftHash('#add-draft=')).toBeNull();
    expect(parseAddDraftHash('#add-draft=%E0%A4%A')).toBeNull();
    expect(parseAddDraftHash('#other')).toBeNull();
  });

  it('takes the address out of the address bar at once, keeping the path, query and router state', () => {
    const { loc, history } = fakeWindow(`#add-draft=${encodeURIComponent(ADDRESS)}`);
    takeAddDraftLink(loc, history);
    expect(history.replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/w?x=1');
    expect(hasPendingDraft()).toBe(true);
    expect(takePendingDraft()).toBe(ADDRESS);
    expect(takePendingDraft()).toBeNull();
    expect(hasPendingDraft()).toBe(false);
  });

  it('leaves any other hash alone', () => {
    const { loc, history } = fakeWindow('#section-2');
    takeAddDraftLink(loc, history);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(hasPendingDraft()).toBe(false);
  });

  it('works on the real address bar', () => {
    window.history.replaceState(null, '', `/#add-draft=${encodeURIComponent(ADDRESS)}`);
    takeAddDraftLink();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('studio.example');
    expect(takePendingDraft()).toBe(ADDRESS);
  });
});
