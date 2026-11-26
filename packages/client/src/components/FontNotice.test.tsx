import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CanvasSnapshot } from '../editor/types.js';
import { useFontNotice } from '../screens/useFontNotice';
import { DOC_ID, testBlock, testDoc } from '../test-utils';
import { FontNotice } from './FontNotice';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const dyslexic: CanvasSnapshot = { docs: [testDoc({ id: DOC_ID, style: { font: 'open_dyslexic' } })], blocks: [] };
const plain: CanvasSnapshot = { docs: [testDoc({ id: DOC_ID })], blocks: [testBlock({ id: 'B1', content: 'Hello' })] };

let confirm: ReturnType<typeof useFontNotice>['confirm'];
function Harness() {
  const notice = useFontNotice();
  confirm = notice.confirm;
  return notice.asking ? <FontNotice question={notice.asking} /> : null;
}

async function ask(snap: CanvasSnapshot) {
  let answer: Promise<boolean> = Promise.resolve(false);
  act(() => {
    answer = confirm(snap, [DOC_ID]);
  });
  return answer;
}

describe('FontNotice', () => {
  it('says nothing when the doc uses only Word fonts', async () => {
    render(<Harness />);
    expect(await ask(plain)).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('warns about OpenDyslexic, and Cancel stops the download', async () => {
    render(<Harness />);
    const answer = ask(dyslexic);
    const dialog = screen.getByRole('dialog', { name: 'This document uses OpenDyslexic' });
    expect(dialog.textContent).toContain('needs it installed');
    expect(screen.getByRole('link', { name: 'opendyslexic.org' }).getAttribute('href')).toBe('https://opendyslexic.org');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await answer).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('downloads, and with the box ticked is not shown again', async () => {
    render(<Harness />);
    let answer = ask(dyslexic);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await answer).toBe(true);
    // Not ticked: asked again.
    answer = ask(dyslexic);
    fireEvent.click(screen.getByRole('checkbox', { name: "Don't show this again" }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await answer).toBe(true);
    expect(await ask(dyslexic)).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
