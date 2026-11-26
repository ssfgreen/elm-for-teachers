// `pnpm sessions`: the workshop sessions in data/Telemetry (not committed) as Spyglass cases in
// fixtures/sessions/, one file per session, teacher-facing words only. Calls no model.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { REPO_ROOT } from '../src/context.js';
import { SESSIONS_DIR } from '../src/judge/experiment.js';
import { casesFromBundle, sessionName } from '../src/sessions/bundle.js';

it('writes the session cases', () => {
  const from = process.env.EVAL_SESSIONS ? path.resolve(process.env.EVAL_SESSIONS) : path.join(REPO_ROOT, 'data/Telemetry');
  mkdirSync(SESSIONS_DIR, { recursive: true });
  for (const d of readdirSync(from, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(from, e.name))) {
    const cases = casesFromBundle(d);
    const file = path.join(SESSIONS_DIR, `${sessionName(d)}.json`);
    writeFileSync(file, `${JSON.stringify({ session: sessionName(d), cases }, null, 1)}\n`);
    console.log(`${path.relative(REPO_ROOT, file)}: ${cases.length} cases, ${cases.filter((c) => c.judged).length} call the judge`);
  }
});
