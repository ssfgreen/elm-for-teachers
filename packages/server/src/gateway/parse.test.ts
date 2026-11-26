import { describe, expect, it } from 'vitest';
import { parseModelOutput } from './parse.js';

const OPS = '[{"op":"delete","id":"X"}]';

describe('parseModelOutput', () => {
  it('extracts a ```json fence and keeps the surrounding text as the message', () => {
    const r = parseModelOutput(`Here you go.\n\n\`\`\`json\n${OPS}\n\`\`\`\n\nLet me know.`);
    expect(r.rawOperations).toEqual([{ op: 'delete', id: 'X' }]);
    expect(r.message).toBe('Here you go.\n\nLet me know.');
    expect(r.parseError).toBeNull();
  });

  it('accepts a bare ``` fence whose body is a JSON array', () => {
    const r = parseModelOutput(`Done.\n\`\`\`\n${OPS}\n\`\`\``);
    expect(r.rawOperations).toHaveLength(1);
    expect(r.message).toBe('Done.');
  });

  it('accepts an uppercase JSON tag and a fence with no newline before the closer', () => {
    const r = parseModelOutput(`Done.\n\`\`\`JSON\n${OPS}\`\`\``);
    expect(r.rawOperations).toHaveLength(1);
  });

  it('tolerates CRLF line endings', () => {
    const r = parseModelOutput(`Done.\r\n\r\n\`\`\`json\r\n${OPS}\r\n\`\`\`\r\nBye.`);
    expect(r.rawOperations).toHaveLength(1);
    expect(r.message).toBe('Done.\n\nBye.');
  });

  it('skips non-JSON fences and takes the first one that parses as an array', () => {
    const raw = `Example:\n\`\`\`\nThe sun is a golden coin.\n\`\`\`\nOps:\n\`\`\`json\n${OPS}\n\`\`\``;
    const r = parseModelOutput(raw);
    expect(r.rawOperations).toHaveLength(1);
    expect(r.message).toBe('Example:\n```\nThe sun is a golden coin.\n```\nOps:');
    expect(r.parseError).toBeNull();
  });

  it('accepts a whole reply that is a bare JSON array, with an empty message', () => {
    const r = parseModelOutput(`  ${OPS}\n`);
    expect(r.rawOperations).toHaveLength(1);
    expect(r.message).toBe('');
  });

  it('returns null operations and no error for chat-only replies', () => {
    const r = parseModelOutput('  A simile uses like or as.  ');
    expect(r).toEqual({
      message: 'A simile uses like or as.',
      rawOperations: null,
      parseError: null,
    });
  });

  it('reports a broken json fence', () => {
    const r = parseModelOutput('Here.\n```json\n[{"op": "delete", "id": }]\n```');
    expect(r.rawOperations).toBeNull();
    expect(r.parseError).toMatch(/JSON/);
    expect(r.message).toBe('Here.');
  });

  it('reports a json fence that parses to something other than an array', () => {
    const r = parseModelOutput('Here.\n```json\n{"op":"delete","id":"X"}\n```');
    expect(r.rawOperations).toBeNull();
    expect(r.parseError).toMatch(/array/);
  });

  it('reports an unterminated json fence (for example a truncated reply)', () => {
    const r = parseModelOutput('Here.\n```json\n[{"op":"delete"');
    expect(r.rawOperations).toBeNull();
    expect(r.parseError).toMatch(/unterminated/);
    expect(r.message).toBe('Here.');
  });

  it('ignores a bare fence holding prose (not an error)', () => {
    const r = parseModelOutput('Try this:\n```\nMy dog is a rocket.\n```');
    expect(r.rawOperations).toBeNull();
    expect(r.parseError).toBeNull();
    expect(r.message).toBe('Try this:\n```\nMy dog is a rocket.\n```');
  });
});
