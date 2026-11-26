import { afterEach, describe, expect, it } from 'vitest';
import { controlAt, pointTarget } from './target';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pointTarget and controlAt', () => {
  it('name the pane, block and marked item under a point', () => {
    document.body.innerHTML = `
      <section data-pane="canvas"><p data-block-id="B1"><span id="in">text</span></p></section>
      <aside data-pane="chat"><li data-track="message:T1-r"><em id="msg">hi</em></li></aside>
      <div id="portal">menu</div>`;
    expect(pointTarget(document.getElementById('in'))).toEqual({ pane: 'canvas', block_id: 'B1', item: null });
    expect(pointTarget(document.getElementById('msg'))).toEqual({ pane: 'chat', block_id: null, item: 'message:T1-r' });
    expect(pointTarget(document.getElementById('portal')!.firstChild)).toEqual({ pane: 'none', block_id: null, item: null });
    expect(controlAt(document.getElementById('in'))).toBeNull();
  });

  it('give a control its role and accessible name, and never a field’s typed value', () => {
    document.body.innerHTML = `
      <button id="b" aria-label="Accept: new line"><svg id="icon"></svg></button>
      <a href="/x" id="a">  Open   the project </a>
      <div role="menuitem" id="m">Word (.docx)</div>
      <textarea id="t" aria-label="Message">secret pupil name</textarea>
      <input id="i" placeholder="Search" value="typed" />
      <input id="c" type="checkbox" title="Send to model" />`;
    expect(controlAt(document.getElementById('icon'))).toEqual({ role: 'button', label: 'Accept: new line' });
    expect(controlAt(document.getElementById('a'))).toEqual({ role: 'link', label: 'Open the project' });
    expect(controlAt(document.getElementById('m'))).toEqual({ role: 'menuitem', label: 'Word (.docx)' });
    expect(controlAt(document.getElementById('t'))).toEqual({ role: 'textbox', label: 'Message' });
    expect(controlAt(document.getElementById('i'))).toEqual({ role: 'textbox', label: 'Search' });
    expect(controlAt(document.getElementById('c'))).toEqual({ role: 'checkbox', label: 'Send to model' });
  });
});
