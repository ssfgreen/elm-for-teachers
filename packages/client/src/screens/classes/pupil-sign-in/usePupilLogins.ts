/**
 * The "Pupil logins" card's state (#232): the class's logins, loaded once per class and again after
 * each Make, Delete and New password (#246), so the list is always the server's. One request at a
 * time, the first load included.
 *
 * The passwords of the last Make or New password (`made`) live only here: never in storage, the URL, the event
 * logger or any other state. They go on Done (a second click), on moving to another class and when
 * the card unmounts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MadeLogin, PupilLogin, PupilLoginsApi } from '../../../api/pupilLogins';
import type { Envelope } from '../../../api/types';
import { DELETED_RELOAD_FAILED, MADE_RELOAD_FAILED, NEW_PASSWORD_RELOAD_FAILED, deleteRefusal, makeRefusal, newPasswordRefusal } from './pupilLogins';

export interface PupilLoginsState {
  /** `loading` until the first answer; `failed` when it could not load. */
  status: 'loading' | 'failed' | 'ready';
  logins: PupilLogin[];
  /** The logins just made, or the one just given a new password, with their passwords, until Done. */
  made: MadeLogin[] | null;
  /** What `made` came from: a Make, or a New password (one login). */
  madeBy: 'make' | 'new-password';
  /** A request is with the server. */
  busy: boolean;
  /** The last refusal's message, until the next request. */
  problem: string | null;
  /** Done was clicked once and waits for the second click. */
  confirmingDone: boolean;
  /** The login whose Delete was clicked once and waits for the second click. */
  confirmingDelete: string | null;
  /** The login whose New password was clicked once and waits for the second click. */
  confirmingNewPassword: string | null;
  make(count: number): Promise<void>;
  askDone(): void;
  cancelDone(): void;
  /** Second click on Done: the passwords go. */
  confirmDone(): void;
  askDelete(loginId: string): void;
  cancelDelete(): void;
  /** Second click on Delete: deletes the login asked about, then reloads the list. */
  confirmDelete(): Promise<void>;
  askNewPassword(loginId: string): void;
  cancelNewPassword(): void;
  /** Second click on New password: a new password for the login asked about, shown once, then reloads the list. */
  confirmNewPassword(): Promise<void>;
}

export function usePupilLogins(api: PupilLoginsApi, classId: string, getEnvelope: () => Envelope): PupilLoginsState {
  const [status, setStatus] = useState<PupilLoginsState['status']>('loading');
  const [logins, setLogins] = useState<PupilLogin[]>([]);
  const [made, setMade] = useState<MadeLogin[] | null>(null);
  const [madeBy, setMadeBy] = useState<PupilLoginsState['madeBy']>('make');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDone, setConfirmingDone] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingNewPassword, setConfirmingNewPassword] = useState<string | null>(null);
  // The request out, set at once so a second click in the same tick sends nothing. The first
  // load counts as one, so Make waits for it and no late answer overwrites a newer list.
  const out = useRef(false);
  // Moves on with each class (and on unmount): an answer from an older one is dropped, and its
  // request does not free the next class's.
  const gen = useRef(0);
  const { listPupilLogins, makePupilLogins, deletePupilLogin, newPupilPassword } = api;

  useEffect(() => {
    const g = ++gen.current;
    out.current = true;
    setBusy(true);
    setStatus('loading');
    setLogins([]);
    setMade(null);
    setConfirmingDone(false);
    setConfirmingDelete(null);
    setConfirmingNewPassword(null);
    setProblem(null);
    listPupilLogins(classId)
      .then(
        (l) => {
          if (gen.current !== g) return;
          setLogins(l);
          setStatus('ready');
        },
        () => gen.current === g && setStatus('failed'),
      )
      .finally(() => {
        if (gen.current !== g) return;
        out.current = false;
        setBusy(false);
      });
    const counter = gen; // the ref itself, not a value from it: the cleanup moves it on
    return () => {
      counter.current++;
    };
  }, [listPupilLogins, classId]);

  /** Runs one request, or nothing while another is out. `current()` is false once the class has changed. */
  const one = useCallback(async (run: (current: () => boolean) => Promise<void>) => {
    if (out.current) return;
    const g = gen.current;
    const current = () => gen.current === g;
    out.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await run(current);
    } finally {
      if (current()) {
        out.current = false;
        setBusy(false);
      }
    }
  }, []);

  const make = useCallback(
    (count: number) =>
      one(async (current) => {
        // A New password still being asked would replace this batch on screen: it goes.
        setConfirmingNewPassword(null);
        let fresh: MadeLogin[];
        try {
          fresh = await makePupilLogins(classId, count, getEnvelope());
        } catch (e) {
          if (current()) setProblem(makeRefusal(e));
          return;
        }
        if (!current()) return;
        setMade(fresh);
        setMadeBy('make');
        setConfirmingDone(false);
        try {
          const l = await listPupilLogins(classId);
          if (!current()) return;
          setLogins(l);
          setStatus('ready');
        } catch {
          if (current()) setProblem(MADE_RELOAD_FAILED);
        }
      }),
    [one, makePupilLogins, listPupilLogins, classId, getEnvelope],
  );

  const confirmDelete = useCallback(
    () =>
      one(async (current) => {
        const loginId = confirmingDelete;
        setConfirmingDelete(null);
        if (!loginId) return;
        try {
          await deletePupilLogin(classId, loginId);
        } catch (e) {
          if (current()) setProblem(deleteRefusal(e));
          return;
        }
        try {
          const l = await listPupilLogins(classId);
          if (current()) setLogins(l);
        } catch {
          if (current()) setProblem(DELETED_RELOAD_FAILED);
        }
      }),
    [one, confirmingDelete, deletePupilLogin, listPupilLogins, classId],
  );

  const confirmNewPassword = useCallback(
    () =>
      one(async (current) => {
        // Never while passwords are on show: the new one would replace them, and they cannot come back.
        if (made) {
          setConfirmingNewPassword(null);
          return;
        }
        const loginId = confirmingNewPassword;
        setConfirmingNewPassword(null);
        if (!loginId) return;
        let fresh: MadeLogin;
        try {
          fresh = await newPupilPassword(classId, loginId, getEnvelope());
        } catch (e) {
          if (current()) setProblem(newPasswordRefusal(e));
          return;
        }
        if (!current()) return;
        setMade([fresh]);
        setMadeBy('new-password');
        setConfirmingDone(false);
        try {
          const l = await listPupilLogins(classId);
          if (current()) setLogins(l);
        } catch {
          if (current()) setProblem(NEW_PASSWORD_RELOAD_FAILED);
        }
      }),
    [one, made, confirmingNewPassword, newPupilPassword, listPupilLogins, classId, getEnvelope],
  );

  return {
    status,
    logins,
    made,
    madeBy,
    busy,
    problem,
    confirmingDone,
    confirmingDelete,
    confirmingNewPassword,
    make,
    askDone: () => setConfirmingDone(true),
    cancelDone: () => setConfirmingDone(false),
    confirmDone: () => {
      setMade(null);
      setConfirmingDone(false);
    },
    askDelete: (loginId) => {
      setProblem(null);
      setConfirmingNewPassword(null);
      setConfirmingDelete(loginId);
    },
    cancelDelete: () => setConfirmingDelete(null),
    confirmDelete,
    askNewPassword: (loginId) => {
      setProblem(null);
      setConfirmingDelete(null);
      setConfirmingNewPassword(loginId);
    },
    cancelNewPassword: () => setConfirmingNewPassword(null),
    confirmNewPassword,
  };
}
