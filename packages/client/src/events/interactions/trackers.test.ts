import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockLogger } from '../../test-utils';
import { attachClickTracking } from './click';
import { attachInteractionTracking } from './index';
import { attachPageState } from './pageState';
import { attachPointerSampling } from './pointer';
import { attachTextSelect } from './textSelect';
import { attachUiStateTracking } from './uiState';
import { attachViewportTracking, readViewport } from './viewport';

const kinds = (log: ReturnType<typeof mockLogger>['log']) => log.mock.calls.map((c) => c[0] as string);
const payloads = (log: ReturnType<typeof mockLogger>['log'], kind: string) => log.mock.calls.filter((c) => c[0] === kind).map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="root"><section data-pane="canvas"><p data-block-id="B1" id="p">Text</p><button id="btn">Accept</button></section></main>';
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const move = (el: Element, x: number, y: number) => el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));

describe('pointer sampling', () => {
  it('keeps one sample per interval and sends them together after a while', () => {
    const logger = mockLogger();
    let t = 1000;
    const off = attachPointerSampling(logger, document, { intervalMs: 100, sendMs: 2000, now: () => t });
    const p = document.getElementById('p')!;
    move(p, 10.4, 20.6);
    t += 50;
    move(p, 11, 21); // inside the interval: dropped
    t += 60;
    move(p, 12, 22);
    expect(logger.log).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(payloads(logger.log, 'pointer')).toEqual([
      { interval_ms: 100, samples: [{ t: 1000, x: 10, y: 21, pane: 'canvas', block_id: 'B1', item: null }, { t: 1110, x: 12, y: 22, pane: 'canvas', block_id: 'B1', item: null }] },
    ]);
    off();
  });

  it('sends early when full, and sends what is waiting when stopped', () => {
    const logger = mockLogger();
    let t = 0;
    const off = attachPointerSampling(logger, document, { intervalMs: 10, maxSamples: 2, now: () => (t += 10) });
    const p = document.getElementById('p')!;
    move(p, 1, 1);
    move(p, 2, 2);
    expect(payloads(logger.log, 'pointer')).toHaveLength(1);
    move(p, 3, 3);
    off();
    expect(payloads(logger.log, 'pointer')).toHaveLength(2);
    move(p, 4, 4);
    vi.advanceTimersByTime(5000);
    expect(payloads(logger.log, 'pointer')).toHaveLength(2);
  });
});

describe('click tracking', () => {
  it('logs a click with its control even when a component stops it, and a keyboard click with count 0', () => {
    const logger = mockLogger();
    const off = attachClickTracking(logger, document);
    const btn = document.getElementById('btn')!;
    btn.addEventListener('click', (e) => e.stopPropagation());
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 6, detail: 1 }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    document.getElementById('p')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 1, clientY: 1 }));
    expect(payloads(logger.log, 'click')).toEqual([
      { pane: 'canvas', block_id: null, item: null, x: 5, y: 6, button: 0, count: 1, control: { role: 'button', label: 'Accept' } },
      { pane: 'canvas', block_id: null, item: null, x: 0, y: 0, button: 0, count: 0, control: { role: 'button', label: 'Accept' } },
      { pane: 'canvas', block_id: 'B1', item: null, x: 1, y: 1, button: 2, count: 1, control: null },
    ]);
    off();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(payloads(logger.log, 'click')).toHaveLength(3);
  });
});

describe('viewport tracking', () => {
  it('logs the window and the visible regions, and again only when they change', () => {
    const pane = document.querySelector('[data-pane]')!;
    let width = 600;
    vi.spyOn(pane, 'getBoundingClientRect').mockImplementation(() => ({ left: 10.2, top: 0, width, height: 400 }) as DOMRect);
    const logger = mockLogger();
    const off = attachViewportTracking(logger, window, document.getElementById('root')!, 500);
    expect(payloads(logger.log, 'viewport')).toEqual([{ width: window.innerWidth, height: window.innerHeight, device_pixel_ratio: window.devicePixelRatio || 1, regions: { canvas: { left: 10, top: 0, width: 600, height: 400 } } }]);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);
    expect(payloads(logger.log, 'viewport')).toHaveLength(1);
    width = 500;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);
    expect(payloads(logger.log, 'viewport').at(-1)?.regions).toEqual({ canvas: { left: 10, top: 0, width: 500, height: 400 } });
    off();
  });

  it('leaves out a hidden region', () => {
    expect(readViewport(window).regions).toEqual({});
  });
});

describe('ui state tracking', () => {
  it('logs a menu or dialog opening and closing, with its name', async () => {
    const logger = mockLogger();
    const off = attachUiStateTracking(logger, document, 100);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Export');
    document.body.append(menu);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<h2>Word preview</h2>';
    document.body.append(dialog);
    await vi.advanceTimersByTimeAsync(100);
    menu.remove();
    await vi.advanceTimersByTimeAsync(100);
    expect(payloads(logger.log, 'ui_state')).toEqual([
      { role: 'menu', label: 'Export', open: true },
      { role: 'dialog', label: 'Word preview', open: true },
      { role: 'menu', label: 'Export', open: false },
    ]);
    off();
  });
});

describe('ui state tracking, quick menus', () => {
  it('catches a menu that opens and closes inside one scan interval', async () => {
    const logger = mockLogger();
    const off = attachUiStateTracking(logger, document, 100);
    await vi.advanceTimersByTimeAsync(500);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
    menu.remove();
    await vi.advanceTimersByTimeAsync(200);
    expect(payloads(logger.log, 'ui_state')).toEqual([
      { role: 'menu', label: null, open: true },
      { role: 'menu', label: null, open: false },
    ]);
    off();
  });
});

describe('page state', () => {
  it('logs the state on start and on each change, not repeats', () => {
    const logger = mockLogger();
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const off = attachPageState(logger, window);
    focus.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    vi.runAllTimers();
    window.dispatchEvent(new Event('blur'));
    vi.runAllTimers();
    expect(payloads(logger.log, 'page_state')).toEqual([{ visible: true, focused: true }, { visible: true, focused: false }]);
    off();
  });
});

describe('text selection outside the editor', () => {
  it('logs selected text once, cut to length, and not in the editor or a field', () => {
    document.body.innerHTML = `<aside data-pane="chat"><li data-track="message:T1-r" id="msg">The answer is ${'x'.repeat(600)}</li></aside><div contenteditable="true" id="ed">doc</div>`;
    const logger = mockLogger();
    const off = attachTextSelect(logger, document, 0);
    const select = (id: string) => {
      document.getSelection()!.selectAllChildren(document.getElementById(id)!);
      document.dispatchEvent(new Event('selectionchange'));
      vi.runAllTimers();
    };
    select('msg');
    select('msg');
    select('ed');
    const [p] = payloads(logger.log, 'text_select');
    expect(payloads(logger.log, 'text_select')).toHaveLength(1);
    expect(p).toMatchObject({ pane: 'chat', item: 'message:T1-r', length: 614 });
    expect((p!.text as string).length).toBe(500);
    off();
  });
});

describe('attachInteractionTracking', () => {
  it('starts every tracker and stops them all', () => {
    const logger = mockLogger();
    const off = attachInteractionTracking(logger, document.getElementById('root')!);
    expect(kinds(logger.log)).toEqual(expect.arrayContaining(['page_state', 'viewport']));
    off();
    const before = logger.log.mock.calls.length;
    document.getElementById('btn')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(5000);
    expect(logger.log.mock.calls.length).toBe(before);
  });
});
