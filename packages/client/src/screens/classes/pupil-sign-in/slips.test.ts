import { describe, expect, it } from 'vitest';
import { LOG_IN, SIGN_UP, WHO_PUPIL } from '../../landing/content';
import { CODE_ON_SLIPS, SLIP_STEPS, slipsHtml } from './slips';

const logins = [
  { id: 'L1', username: 'tidy-otter-42', password: 'apple-river-9' },
  { id: 'L2', username: 'brave-heron-7', password: 'cloud-maple-3' },
  { id: 'L3', username: 'quiet-fox-18', password: 'stone-lark-5' },
];

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('slipsHtml', () => {
  it('draws one slip per login, each with the class, the address, the username and the password', () => {
    const doc = parse(slipsHtml({ className: 'P7 Birch', address: 'edw.example.org', logins }));
    const slips = [...doc.querySelectorAll('.slip')];
    expect(slips).toHaveLength(3);
    slips.forEach((s, i) => {
      expect(s.querySelector('h2')!.textContent).toBe('P7 Birch');
      expect(s.textContent).toContain('edw.example.org');
      expect(s.textContent).toContain(logins[i]!.username);
      expect(s.textContent).toContain(logins[i]!.password);
      expect(s.textContent).toContain(SLIP_STEPS);
    });
  });

  it('keeps a class name as text', () => {
    const doc = parse(slipsHtml({ className: '<b>P7</b> & "S1"', address: 'x', logins: logins.slice(0, 1) }));
    expect(doc.querySelector('b')).toBeNull();
    expect(doc.querySelector('.slip h2')!.textContent).toBe('<b>P7</b> & "S1"');
  });

  it('tells the pupil the way in with the front page’s words', () => {
    expect(SLIP_STEPS).toBe(`First time: ${SIGN_UP}, then ${WHO_PUPIL}, then the class code from your teacher. After that: ${LOG_IN}.`);
    expect(SLIP_STEPS).toBe('First time: Sign up, then I am a pupil, then the class code from your teacher. After that: Log in.');
  });

  it('has no class code on it while CODE_ON_SLIPS is off (question 118)', () => {
    expect(CODE_ON_SLIPS).toBe(false);
    const html = slipsHtml({ className: 'P7', address: 'x', logins, code: 'ABCD-EFGH' });
    expect(html).not.toContain('ABCD-EFGH');
  });
});
