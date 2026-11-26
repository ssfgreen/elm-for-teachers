// `pnpm judge-models`: the Spyglass judge experiment (docs/spyglass.md, Part 8). Calls the model:
// run by hand. EVAL_PROVIDER=mock tries it offline; JUDGE_RUNS and JUDGE_MODELS change the runs.
import { it } from 'vitest';
import { runJudgeExperiment } from '../src/judge/experiment.js';

it('runs the judge experiment', async () => {
  console.log(await runJudgeExperiment());
});
