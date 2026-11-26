import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachBlockVisibility,
  attachClipboardMarker,
  attachFocusTracking,
  attachPreviewScrollTracking,
  attachScrollTracking,
  createFocusPaneState,
  createThrottle,
} from './trackers';

describe('createThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires on the leading edge and delivers the last value on the trailing edge', () => {
    const fn = vi.fn();
    const t = createThrottle<number>(250, fn);
    t(1);
    expect(fn.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(100);
    t(2);
    t(3);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(150);
    expect(fn.mock.calls).toEqual([[1], [3]]);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    t(4); // window long expired: leading again
    expect(fn).toHaveBeenLastCalledWith(4);
  });

  it('scroll tracking logs scrollTop throttled', () => {
    const log = vi.fn();
    const el = document.createElement('div');
    const off = attachScrollTracking({ log }, 'canvas', el);
    el.scrollTop = 10;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 99;
    el.dispatchEvent(new Event('scroll'));
    expect(log.mock.calls).toEqual([['scroll', { pane: 'canvas', position: 10 }]]);
    vi.advanceTimersByTime(500);
    expect(log).toHaveBeenLastCalledWith('scroll', { pane: 'canvas', position: 99 });
    off();
  });

  it('scroll tracking follows an inner data-scroll-root and ignores other inner scrollers', () => {
    const log = vi.fn();
    const pane = document.createElement('section');
    const root = document.createElement('div');
    root.setAttribute('data-scroll-root', '');
    const table = document.createElement('div');
    root.appendChild(table);
    pane.appendChild(root);
    document.body.appendChild(pane);
    const off = attachScrollTracking({ log }, 'canvas', pane);
    table.scrollTop = 5;
    table.dispatchEvent(new Event('scroll'));
    expect(log).not.toHaveBeenCalled();
    root.scrollTop = 240;
    root.dispatchEvent(new Event('scroll'));
    expect(log.mock.calls).toEqual([['scroll', { pane: 'canvas', position: 240 }]]);
    off();
    pane.remove();
  });
});

describe('preview scroll tracking', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('logs how far down the preview is and how far it can go, throttled, and the last one on detach', () => {
    const log = vi.fn();
    const body = document.createElement('div');
    Object.defineProperty(body, 'scrollHeight', { value: 3000 });
    Object.defineProperty(body, 'clientHeight', { value: 600 });
    const off = attachPreviewScrollTracking({ log }, 'D1', body, 500);
    body.scrollTop = 100;
    body.dispatchEvent(new Event('scroll'));
    body.scrollTop = 900;
    body.dispatchEvent(new Event('scroll'));
    expect(log.mock.calls).toEqual([['preview_scroll', { doc_id: 'D1', position: 100, max: 2400 }]]);
    body.scrollTop = 2400;
    body.dispatchEvent(new Event('scroll'));
    off();
    expect(log).toHaveBeenLastCalledWith('preview_scroll', { doc_id: 'D1', position: 2400, max: 2400 });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('ignores scrolling inside the pages, such as a wide table', () => {
    const log = vi.fn();
    const body = document.createElement('div');
    const table = document.createElement('div');
    body.appendChild(table);
    const off = attachPreviewScrollTracking({ log }, 'D1', body, 500);
    table.scrollTop = 40;
    table.dispatchEvent(new Event('scroll', { bubbles: false }));
    off();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('focus tracking', () => {
  it('resolves pane and block id from the DOM and logs only changes', () => {
    document.body.innerHTML = `
      <div id="root">
        <nav id="threads"><button id="b">threads</button></nav>
        <main id="canvas"><div data-block-id="BLK1"><p><span id="s" tabindex="0">x</span></p></div></main>
        <section id="chat"><input id="i" /></section>
      </div>
      <button id="out">out</button>`;
    const q = (id: string) => document.getElementById(id) as HTMLElement;
    const log = vi.fn();
    const state = createFocusPaneState();
    const off = attachFocusTracking({ log }, { threads: q('threads'), canvas: q('canvas'), chat: q('chat') }, state);

    q('s').focus();
    expect(state.get()).toBe('canvas');
    q('s').dispatchEvent(new Event('pointerdown', { bubbles: true })); // no change
    q('i').focus();
    q('b').focus();
    q('s').focus();
    expect(log.mock.calls.map((c) => c[1])).toEqual([
      { pane: 'canvas', block_id: 'BLK1' },
      { pane: 'chat', block_id: null },
      { pane: 'threads', block_id: null },
      { pane: 'canvas', block_id: 'BLK1' },
    ]);
    q('out').focus();
    expect(state.get()).toBe('none');
    expect(log).toHaveBeenLastCalledWith('focus', { pane: 'none', block_id: null });
    off();
  });
});

describe('block visibility', () => {
  it('observes blocks added later and reports visibility', async () => {
    let cb!: IntersectionObserverCallback;
    const observed: Element[] = [];
    class FakeIO {
      constructor(c: IntersectionObserverCallback) {
        cb = c;
      }
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const root = document.createElement('div');
    root.innerHTML = '<div data-block-id="A"></div>';
    document.body.append(root);
    const log = vi.fn();
    const vis = attachBlockVisibility({ log }, root);
    expect(observed).toHaveLength(1);
    const b = document.createElement('div');
    b.setAttribute('data-block-id', 'B');
    root.append(b);
    vis.refresh();
    expect(observed).toHaveLength(2);
    cb([{ target: b, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(log).toHaveBeenCalledWith('block_visible', { block_id: 'B', visible: true });
    b.remove();
    vis.refresh();
    expect(log).toHaveBeenLastCalledWith('block_visible', { block_id: 'B', visible: false });
    vis.detach();
    vi.unstubAllGlobals();
  });
});

describe('clipboard marker', () => {
  it('classifies paste source', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p id="p">copied text here</p>';
    document.body.append(root);
    const m = attachClipboardMarker(root);
    expect(m.classify('anything', 8)).toBe('external');
    const range = document.createRange();
    range.selectNodeContents(root.querySelector('#p')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    root.dispatchEvent(new Event('copy', { bubbles: true }));
    expect(m.classify('copied text here', 16)).toBe('internal');
    expect(m.classify('different', 9)).toBe('external');
    expect(m.classify('', 21)).toBe('inferred_external');
    expect(m.classify(null, 20)).toBeNull();
    m.detach();
  });
});
