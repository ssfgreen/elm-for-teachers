/**
 * The class code card's state (#212): the class's code, loaded once per class, and one change at a
 * time (make, renew, close). Nothing on screen changes before the server answers: the code shown
 * is always the server's. Renew and Close wait for a second click (`confirming`).
 */
import { useCallback, useEffect, useState } from 'react';
import type { ClassCodeAction, ClassCodeApi } from '../../../api/classCode';
import type { Envelope } from '../../../api/types';
import { refusalMessage, type Confirmable } from './classCode';

export interface ClassCodeState {
  /** `loading` until the first answer; `failed` when it could not load. */
  status: 'loading' | 'failed' | 'ready';
  code: string | null;
  /** A change is with the server. */
  busy: boolean;
  /** The last refusal's message for the teacher, until the next change. */
  problem: string | null;
  /** Renew or Close was clicked once and waits for the second click. */
  confirming: Confirmable | null;
  make(): Promise<void>;
  /** First click on Renew or Close. */
  ask(action: Confirmable): void;
  cancel(): void;
  /** Second click: sends the action asked for. */
  confirm(): Promise<void>;
}

export function useClassCode(api: ClassCodeApi, classId: string, getEnvelope: () => Envelope): ClassCodeState {
  const [status, setStatus] = useState<ClassCodeState['status']>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirmable | null>(null);
  const { getClassCode, setClassCode } = api;

  useEffect(() => {
    let live = true;
    setStatus('loading');
    setCode(null);
    getClassCode(classId).then(
      (c) => {
        if (!live) return;
        setCode(c);
        setStatus('ready');
      },
      () => live && setStatus('failed'),
    );
    return () => {
      live = false;
    };
  }, [getClassCode, classId]);

  const send = useCallback(
    async (action: ClassCodeAction) => {
      setBusy(true);
      setProblem(null);
      try {
        setCode(await setClassCode(classId, action, getEnvelope()));
      } catch (e) {
        setProblem(refusalMessage(e));
      } finally {
        setBusy(false);
        setConfirming(null);
      }
    },
    [setClassCode, classId, getEnvelope],
  );

  return {
    status,
    code,
    busy,
    problem,
    confirming,
    make: () => send('make'),
    ask: (action) => {
      setProblem(null);
      setConfirming(action);
    },
    cancel: () => setConfirming(null),
    confirm: () => (confirming ? send(confirming) : Promise.resolve()),
  };
}
