/**
 * The mock in a class chat: a sentence naming the first pupil with something noted and the code the class
 * is on now, so the chat's pupil and curriculum mentions can be tried offline (and in e2e).
 */
export function mockClassMentions(items: readonly { role?: unknown; content?: unknown }[]): string {
  const cls = items.find((i) => i.role === 'developer' && typeof i.content === 'string' && i.content.startsWith('## This class'));
  if (typeof cls?.content !== 'string') return '';
  const pupil = /^- (?:Pupil \d+, )?([a-z]+-[a-z]+): (?!Nothing noted\.)/m.exec(cls.content)?.[1];
  const code = /^- ([A-Z]{3,4} [0-4]-\d{2}[a-z])/m.exec(cls.content.slice(cls.content.indexOf('### Curriculum')))?.[1];
  if (!pupil || !code || !cls.content.includes('### Curriculum')) return '';
  return `\n\nFor ${pupil}, it keeps to what the class is working on now, ${code}.`;
}
