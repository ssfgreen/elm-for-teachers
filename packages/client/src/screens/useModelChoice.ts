import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Effort } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { SessionInfo } from '../api/types';
import { readStore, writeStore } from '../lib/store';

const MODEL_KEY = 'edw.model';

/**
 * The model picker under the chat box: the model and effort each turn runs on, remembered in
 * this browser. A model no longer in the config's list falls back to the default.
 */
export function useModelChoice({ session, api }: { session: SessionInfo; api: Pick<SessionApi, 'setTurnModel'> }) {
  const models = useMemo(() => session.config.models ?? [], [session.config.models]);
  const [turnModel, setTurnModel] = useState<{ model: string; effort: Effort }>(() => {
    const fallback = { model: session.config.default_model ?? models[0]?.id ?? '', effort: session.config.default_effort ?? ('medium' as Effort) };
    try {
      const saved = JSON.parse(readStore(MODEL_KEY) ?? 'null') as { model?: string; effort?: Effort } | null;
      if (saved?.model && models.some((m) => m.id === saved.model)) return { model: saved.model, effort: saved.effort ?? fallback.effort };
    } catch {
      // A bad value: the default.
    }
    return fallback;
  });
  useEffect(() => {
    api.setTurnModel?.(models.length && turnModel.model ? turnModel : null);
  }, [api, models.length, turnModel]);
  const onModelChange = useCallback((model: string, effort: Effort) => {
    setTurnModel({ model, effort });
    writeStore(MODEL_KEY, JSON.stringify({ model, effort }));
  }, []);
  return useMemo(() => ({ models, model: turnModel.model, effort: turnModel.effort, onModelChange }), [models, turnModel, onModelChange]);
}
