import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOC_ID, installEditorPolyfills, installIntersectionObserver } from '../test-utils';
import { baseSnap, logged, renderScreen } from './workspaceTestKit';

beforeAll(() => {
  installIntersectionObserver();
  installEditorPolyfills();
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);

/** Records the files the page saves (an <a download> clicked). */
function watchSaves() {
  const saved: string[] = [];
  URL.createObjectURL = vi.fn(() => 'blob:x') as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  return saved;
}

async function downloadWord() {
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name: 'Word (.docx)' }));
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('Word download of a doc in OpenDyslexic', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks first: Cancel saves nothing, Download saves the file', async () => {
    const snap = baseSnap();
    snap.docs[0] = { ...snap.docs[0]!, style: { font: 'open_dyslexic' } };
    const { logger } = await renderScreen(snap);
    const saved = watchSaves();
    await downloadWord();
    expect(screen.getByRole('dialog', { name: 'This document uses OpenDyslexic' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(saved).toEqual([]);
    expect(logged(logger, 'doc_export')).toEqual([]);

    await downloadWord();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    });
    await waitFor(() => expect(saved).toEqual(['Similes.docx']), { timeout: 5000 });
    expect(logged(logger, 'doc_export')).toEqual([{ doc_id: DOC_ID, format: 'docx' }]);
  });

  it('does not ask for a doc in Word fonts', async () => {
    await renderScreen();
    const saved = watchSaves();
    await downloadWord();
    expect(screen.queryByRole('dialog', { name: /This document uses/ })).toBeNull();
    await waitFor(() => expect(saved).toEqual(['Similes.docx']), { timeout: 5000 });
  });
});
