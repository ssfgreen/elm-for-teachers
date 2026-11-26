/**
 * An outcome's benchmarks, shown on asking: Education Scotland's evidence that a learner has
 * achieved it. A benchmark is for all the outcomes in its row of the benchmark document.
 */
import { useState } from 'react';
import type { CurriculumBenchmark } from '@edw/shared';
import type { SessionApi } from '../../api/participant';

export function Benchmarks({ api, code }: { api: Pick<SessionApi, 'curriculumBenchmarks'>; code: string }) {
  const [state, setState] = useState<{ list: CurriculumBenchmark[]; levels: string[] } | 'closed' | 'loading' | 'failed'>('closed');
  if (!api.curriculumBenchmarks) return null;
  const open = () => {
    setState('loading');
    api.curriculumBenchmarks!(code.split('/').map((c) => c.trim()))
      .then((r) => setState({ list: r.benchmarks, levels: r.benchmark_levels }))
      .catch(() => setState('failed'));
  };
  return (
    <div className="text-xs">
      <button type="button" className="border-0 bg-transparent p-0 text-primary underline" aria-expanded={typeof state === 'object'} onClick={() => (typeof state === 'object' ? setState('closed') : open())}>
        Benchmarks for {code}
      </button>
      {state === 'loading' && <span className="ml-2 text-muted-foreground">Loading…</span>}
      {state === 'failed' && <span className="ml-2 text-destructive">They could not be loaded.</span>}
      {typeof state === 'object' && (
        <ul className="m-0 mt-1 flex flex-col gap-0.5 pl-4 text-foreground-2" aria-label={`Benchmarks for ${code}`}>
          {state.list.length === 0 && <li className="list-none text-muted-foreground">None for this outcome at {state.levels.join(' or ')} level yet.</li>}
          {state.list.map((b) => (
            <li key={b.id}>{b.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
