import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionApi } from '../api/participant';
import type { SessionInfo } from '../api/types';
import type { EventLogger } from '../events/logger';
import { readStore, writeStore } from '../lib/store';
import { editModeOf, readMode, suggestViewOf, type AssistantMode } from '../state/assistantMode';
import { useModelChoice } from './useModelChoice';

const EDIT_MODE_KEY = 'edw.editMode';
const SPYGLASS_KEY = 'edw.spyglass';

/**
 * The settings in the row under the chat box, for every turn that follows: the model and its
 * effort (useModelChoice), whether the assistant edits, suggests, or suggests as tracked changes
 * (assistantMode.ts), and Spyglass on or off (shown unless the deployment has it off). All are
 * remembered in this browser; Suggesting and Spyglass on are the defaults. Switching Spyglass is
 * logged; the mode and its look are logged with each turn (chat_prompt).
 */
export function useComposerBar({ session, api, logger }: { session: SessionInfo; api: Pick<SessionApi, 'setTurnModel' | 'setEditMode' | 'setSpyglass'>; logger?: Pick<EventLogger, 'log'> }) {
  const model = useModelChoice({ session, api });
  const [editMode, setEditMode] = useState<AssistantMode>(() => readMode(readStore(EDIT_MODE_KEY)));
  const suggestView = suggestViewOf(editMode);
  useEffect(() => {
    api.setEditMode?.(editModeOf(editMode), suggestView);
  }, [api, editMode, suggestView]);
  const onEditModeChange = useCallback((mode: AssistantMode) => {
    setEditMode(mode);
    writeStore(EDIT_MODE_KEY, mode);
  }, []);
  const offered = session.config.spyglass !== undefined && session.config.spyglass !== 'off';
  const [spyglass, setSpyglass] = useState(() => readStore(SPYGLASS_KEY) !== 'off');
  useEffect(() => {
    if (session.config.spyglass !== undefined) api.setSpyglass?.(spyglass);
  }, [api, session.config.spyglass, spyglass]);
  const onSpyglassChange = useCallback(
    (on: boolean) => {
      setSpyglass(on);
      writeStore(SPYGLASS_KEY, on ? 'on' : 'off');
      logger?.log('spyglass_toggle', { on });
    },
    [logger],
  );
  return useMemo(() => ({ ...model, editMode, suggestView, onEditModeChange, ...(offered ? { spyglass, onSpyglassChange } : {}) }), [model, editMode, suggestView, onEditModeChange, offered, spyglass, onSpyglassChange]);
}
