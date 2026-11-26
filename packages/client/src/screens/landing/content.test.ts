import { describe, expect, it } from 'vitest';
import { FOR_SCHOOLS, QUESTIONS } from './content';

// The landing page describes the tool; instructions to teachers live elsewhere (#81).
describe('landing copy', () => {
  const card = (id: string) => FOR_SCHOOLS.find((f) => f.id === id)?.body ?? '';

  it('states what the tool offers on the pupils card rather than instructing', () => {
    expect(card('pupils')).toBe("We provide a way for you to store key information about your pupils' accessibility needs without revealing identifiable information.");
  });

  it('keeps instructions out of the workspace card and the pupils FAQ', () => {
    expect(card('workspace')).not.toMatch(/keep your link/i);
    const faq = QUESTIONS.find((q) => q.q === "Can I put my pupils' details in?")?.a ?? '';
    expect(faq).not.toMatch(/upload/i);
    for (const text of [card('pupils'), card('workspace'), faq]) expect(text).not.toMatch(/please do not|for now/i);
  });
});
