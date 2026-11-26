import { describe, expect, it, vi } from 'vitest';
import type { Pupil } from '@edw/shared';
import type { ClassDetail } from '../api/classes';
import { classDetailStore, createClassDetailStore, withAdded } from './classDetail';

const pupil = (id: string, label: string) => ({ id, label, needs: [] }) as unknown as Pupil;
const detail = (...pupils: Pupil[]): ClassDetail => ({ class: {} as never, year_group: null, pupils });
const settle = () => new Promise((r) => setTimeout(r));

/** A getClass whose answers the test sends, in the order it was asked. */
function slowApi() {
  const waiting: ((d: ClassDetail) => void)[] = [];
  const getClass = vi.fn(() => new Promise<ClassDetail>((resolve) => waiting.push(resolve)));
  return { getClass, answer: (d: ClassDetail) => waiting.shift()!(d) };
}

describe('classDetailStore', () => {
  it('loads a class once for calls made together, and tells its listeners', async () => {
    const api = slowApi();
    const store = createClassDetailStore(api);
    const heard = vi.fn();
    store.subscribe(heard);
    store.load('c1');
    store.load('c1');
    expect(api.getClass).toHaveBeenCalledTimes(1);
    expect(store.entry('c1').detail).toBeNull();
    api.answer(detail(pupil('p1', 'tidy-puffin')));
    await settle();
    expect(store.entry('c1').detail?.pupils.map((p) => p.label)).toEqual(['tidy-puffin']);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('keeps a change made while a load was on its way, and loads again', async () => {
    const api = slowApi();
    const store = createClassDetailStore(api);
    store.load('c1');
    api.answer(detail(pupil('p1', 'tidy-puffin')));
    await settle();

    store.load('c1');
    store.update('c1', (d) => ({ ...d, pupils: [pupil('p1', 'brave-kettle')] }));
    // The answer from before the change does not undo it.
    api.answer(detail(pupil('p1', 'tidy-puffin')));
    await settle();
    expect(store.entry('c1').detail?.pupils[0]!.label).toBe('brave-kettle');
    expect(api.getClass).toHaveBeenCalledTimes(3);
    api.answer(detail(pupil('p1', 'brave-kettle'), pupil('p2', 'jolly-teapot')));
    await settle();
    expect(store.entry('c1').detail?.pupils).toHaveLength(2);
  });

  it('says a first load failed; a later failure keeps what is held', async () => {
    const getClass = vi.fn<(id: string) => Promise<ClassDetail>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(detail(pupil('p1', 'tidy-puffin'))).mockRejectedValueOnce(new Error('offline'));
    const store = createClassDetailStore({ getClass });
    store.load('c1');
    await settle();
    expect(store.entry('c1')).toEqual({ detail: null, failed: true });
    store.load('c1');
    await settle();
    expect(store.entry('c1').failed).toBe(false);
    store.load('c1');
    await settle();
    expect(store.entry('c1').detail?.pupils).toHaveLength(1);
  });

  it('refreshes only a class it holds, and changes nothing before a class has loaded', async () => {
    const api = slowApi();
    const store = createClassDetailStore(api);
    store.refresh('c2');
    store.update('c2', (d) => d);
    expect(api.getClass).not.toHaveBeenCalled();
    expect(store.entry('c2').detail).toBeNull();
    store.load('c2');
    api.answer(detail());
    await settle();
    store.refresh('c2');
    expect(api.getClass).toHaveBeenCalledTimes(2);
  });

  it('a refresh while a load is on its way throws that answer away and loads again', async () => {
    const api = slowApi();
    const store = createClassDetailStore(api);
    store.load('c1');
    api.answer(detail(pupil('p1', 'tidy-puffin')));
    await settle();

    store.load('c1');
    // A pupil moved in on the server; the load on its way was asked for before that.
    store.refresh('c1');
    api.answer(detail(pupil('p1', 'tidy-puffin')));
    await settle();
    expect(api.getClass).toHaveBeenCalledTimes(3);
    expect(store.entry('c1').detail?.pupils).toHaveLength(1);
    api.answer(detail(pupil('p1', 'tidy-puffin'), pupil('p2', 'jolly-teapot')));
    await settle();
    expect(store.entry('c1').detail?.pupils).toHaveLength(2);
  });

  it('a refresh during the first load does the same', async () => {
    const api = slowApi();
    const store = createClassDetailStore(api);
    store.load('c1');
    store.refresh('c1');
    api.answer(detail());
    await settle();
    expect(store.entry('c1').detail).toBeNull();
    expect(api.getClass).toHaveBeenCalledTimes(2);
    api.answer(detail(pupil('p2', 'jolly-teapot')));
    await settle();
    expect(store.entry('c1').detail?.pupils).toHaveLength(1);
  });

  it('is one store per api', () => {
    const api = { getClass: vi.fn() };
    expect(classDetailStore(api)).toBe(classDetailStore(api));
    expect(classDetailStore({ getClass: vi.fn() })).not.toBe(classDetailStore(api));
  });

  it('joins new rows without doubling one a load already had', () => {
    expect(withAdded([pupil('p1', 'a'), pupil('p2', 'b')], [pupil('p2', 'b'), pupil('p3', 'c')]).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});
