import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginInfo } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import { PluginsScreen } from './PluginsScreen';

const plugins: PluginInfo[] = [
  { id: 'arasaac', kind: 'pictures', name: 'ARASAAC pictures', publisher: 'Government of Aragón', description: 'Pictograms for teaching.', licence: 'CC BY-NC-SA 4.0', homepage: 'https://arasaac.org', tags: ['symbols'], trust: 'use', available: true },
  { id: 'trails', kind: 'library', name: 'TRAILS', publisher: 'TRAILS', description: 'AI literacy lessons.', licence: 'Not stated yet', tags: [], trust: 'ask', available: false },
];
const envelope = { client_ts: '2026-11-08T09:00:00.000Z', focus_pane: 'none' as const, doc_id: null, thread_id: null };

function setup(setPluginTrust: SessionApi['setPluginTrust'] = vi.fn(async (id, trust) => ({ ...plugins.find((p) => p.id === id)!, trust }))) {
  const api = { listPlugins: vi.fn(async () => plugins), setPluginTrust } as unknown as SessionApi;
  render(<PluginsScreen api={api} getEnvelope={() => envelope} />);
  return api;
}
const card = async (name: string) => within(await screen.findByRole('listitem', { name }));

afterEach(cleanup);

describe('Plugins', () => {
  it('lists the plugins with their publisher, licence and level, and says when one is not set up', async () => {
    setup();
    const trails = await card('TRAILS');
    expect(trails.getByText('Not set up yet')).toBeTruthy();
    expect(trails.getByRole('radio', { name: 'Ask first' })).toHaveProperty('checked', true);
    expect(trails.getByText(/not connected here yet/)).toBeTruthy();
    const pictures = await card('ARASAAC pictures');
    expect(pictures.getByText(/Government of Aragón · Licence: CC BY-NC-SA 4.0/)).toBeTruthy();
    expect(pictures.getByRole('radio', { name: 'Use freely' })).toHaveProperty('checked', true);
  });

  it('searches and filters by kind', async () => {
    setup();
    await card('TRAILS');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search plugins' }), { target: { value: 'symbols' } });
    expect(screen.queryByRole('listitem', { name: 'TRAILS' })).toBeNull();
    expect(screen.getByRole('listitem', { name: 'ARASAAC pictures' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Libraries' }));
    expect(screen.getByText(/Nothing matches that/)).toBeTruthy();
  });

  it('saves a new level for the workspace', async () => {
    const api = setup();
    fireEvent.click((await card('ARASAAC pictures')).getByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(api.setPluginTrust).toHaveBeenCalledWith('arasaac', 'off', envelope));
    expect((await card('ARASAAC pictures')).getByText('The assistant never uses it.')).toBeTruthy();
  });

  it('puts the level back and says so when it cannot be saved', async () => {
    setup(vi.fn(async () => {
      throw new Error('offline');
    }));
    fireEvent.click((await card('ARASAAC pictures')).getByRole('radio', { name: 'Off' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be saved/);
    expect((await card('ARASAAC pictures')).getByRole('radio', { name: 'Use freely' })).toHaveProperty('checked', true);
  });
});
