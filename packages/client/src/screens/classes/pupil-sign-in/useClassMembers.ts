/**
 * The "Pupils who joined" card's state (#220): the class's pupils, loaded once per class and again
 * after each Remove, so the list is always the server's. One Remove at a time, and only on a second
 * click (`confirming`). A refusal leaves the list as it was; a Remove whose reload fails says so.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ClassMember, ClassMembersApi } from '../../../api/classMembers';
import type { Envelope } from '../../../api/types';
import { RELOAD_FAILED, removeRefusal } from './classMembers';

export interface ClassMembersState {
  /** `loading` until the first answer; `failed` when it could not load. */
  status: 'loading' | 'failed' | 'ready';
  members: ClassMember[];
  /** A Remove is with the server. */
  busy: boolean;
  /** The last refusal's message, until the next Remove. */
  problem: string | null;
  /** The member whose Remove was clicked once and waits for the second click. */
  confirming: string | null;
  ask(memberId: string): void;
  cancel(): void;
  /** Second click: removes the member asked about, then reloads the list. */
  confirm(): Promise<void>;
}

export function useClassMembers(api: ClassMembersApi, classId: string, getEnvelope: () => Envelope): ClassMembersState {
  const [status, setStatus] = useState<ClassMembersState['status']>('loading');
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { listClassMembers, removeClassMember } = api;

  useEffect(() => {
    let live = true;
    setStatus('loading');
    setMembers([]);
    listClassMembers(classId).then(
      (m) => {
        if (!live) return;
        setMembers(m);
        setStatus('ready');
      },
      () => live && setStatus('failed'),
    );
    return () => {
      live = false;
    };
  }, [listClassMembers, classId]);

  const confirm = useCallback(async () => {
    if (!confirming || busy) return;
    setBusy(true);
    setProblem(null);
    let removed = false;
    try {
      await removeClassMember(classId, confirming, getEnvelope());
      removed = true;
    } catch (e) {
      setProblem(removeRefusal(e));
    }
    // After a Remove or a refusal alike, show what the server has now.
    try {
      setMembers(await listClassMembers(classId));
    } catch {
      // The list shown may still have the removed pupil: say so rather than leave it looking current.
      if (removed) setProblem(RELOAD_FAILED);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }, [confirming, busy, removeClassMember, listClassMembers, classId, getEnvelope]);

  return {
    status,
    members,
    busy,
    problem,
    confirming,
    ask: (memberId) => {
      setProblem(null);
      setConfirming(memberId);
    },
    cancel: () => setConfirming(null),
    confirm,
  };
}
