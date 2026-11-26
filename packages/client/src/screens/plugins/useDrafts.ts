/**
 * The workspace's studio drafts on the Plugins screen: the list, adding one by its address (pasted,
 * or offered from an `#add-draft=` link), and removing one. `status` is 'off' when the server has
 * drafts switched off (404 `drafts_off`), or the api has no drafts calls: the screen then shows
 * nothing about drafts, except one line when a studio link was waiting (`linkOff`).
 */
import { useCallback, useEffect, useState } from 'react';
import type { PluginDraft } from '@edw/shared';
import type { SessionApi } from '../../api/participant';
import type { Envelope } from '../../api/types';
import { takePendingDraft } from './draftLink';
import { ADD_FAILED, addRefusal, isDraftsOff, isGone, LIST_FAILED, REMOVE_FAILED, withDraft, withoutDraft } from './drafts';

export type DraftsStatus = 'loading' | 'off' | 'ready' | 'failed';

export interface Drafts {
  status: DraftsStatus;
  drafts: PluginDraft[];
  /** A draft address from an `#add-draft=` link, waiting for Add or Cancel. Never shown. */
  offered: boolean;
  /** The last thing that went wrong, in words for the teacher; cleared by the next try. */
  error: string | null;
  /** A studio link arrived but drafts are off here: the screen says so in one line. */
  linkOff: boolean;
  /** Set after an add that found the draft already here. */
  notice: string | null;
  adding: boolean;
  /** Adds the draft at a pasted address; true when it is in the list afterwards. */
  add(address: string): Promise<boolean>;
  acceptOffer(): Promise<boolean>;
  declineOffer(): void;
  /** Removes a draft; rejects (with the message) when it could not be removed. */
  remove(id: string): Promise<void>;
}

export function useDrafts(api: SessionApi, getEnvelope: () => Envelope): Drafts {
  const on = Boolean(api.listPluginDrafts && api.addPluginDraft && api.removePluginDraft);
  const [status, setStatus] = useState<DraftsStatus>(on ? 'loading' : 'off');
  const [drafts, setDrafts] = useState<PluginDraft[]>([]);
  const [offer, setOffer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [linkOff, setLinkOff] = useState(false);

  useEffect(() => {
    if (!on) {
      takePendingDraft();
      return;
    }
    let cancelled = false;
    api.listPluginDrafts!()
      .then((ds) => {
        if (cancelled) return;
        setDrafts(Array.isArray(ds) ? ds : []);
        setStatus('ready');
        setOffer(takePendingDraft());
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // A link that cannot be offered is dropped: it lives in memory only.
        const hadLink = takePendingDraft() !== null;
        if (isDraftsOff(e)) {
          setStatus('off');
          setLinkOff(hadLink);
        } else {
          setStatus('failed');
          setError(LIST_FAILED);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, on]);

  /** 'kept' when a later try might work (a failure, not a refusal). */
  const tryAdd = useCallback(
    async (address: string): Promise<'added' | 'refused' | 'kept'> => {
      const trimmed = address.trim();
      if (!trimmed || !api.addPluginDraft) return 'refused';
      setAdding(true);
      setError(null);
      setNotice(null);
      try {
        const draft = await api.addPluginDraft(trimmed, getEnvelope());
        if (drafts.some((d) => d.id === draft.id)) setNotice(`“${draft.name}” is already in this workspace.`);
        setDrafts((ds) => withDraft(ds, draft));
        return 'added';
      } catch (e) {
        if (isDraftsOff(e)) {
          setStatus('off');
          setLinkOff(offer !== null);
          return 'refused';
        }
        const message = addRefusal(e);
        setError(message);
        return message === ADD_FAILED ? 'kept' : 'refused';
      } finally {
        setAdding(false);
      }
    },
    [api, getEnvelope, drafts, offer],
  );

  const add = useCallback(async (address: string) => (await tryAdd(address)) === 'added', [tryAdd]);

  const acceptOffer = useCallback(async () => {
    if (!offer) return false;
    const r = await tryAdd(offer);
    // Kept only after a failure that may pass on a second try; a refusal will not.
    if (r !== 'kept') setOffer(null);
    return r === 'added';
  }, [tryAdd, offer]);

  const declineOffer = useCallback(() => {
    setOffer(null);
    setError(null);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      setNotice(null);
      try {
        await api.removePluginDraft?.(id, getEnvelope());
      } catch (e) {
        if (isDraftsOff(e)) {
          setStatus('off');
          return;
        }
        if (!isGone(e)) throw new Error(REMOVE_FAILED);
      }
      setDrafts((ds) => withoutDraft(ds, id));
    },
    [api, getEnvelope],
  );

  return { status, drafts, offered: offer !== null, linkOff, error, notice, adding, add, acceptOffer, declineOffer, remove };
}
