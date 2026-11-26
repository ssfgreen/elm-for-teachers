/**
 * Ask first in a chat: the plugins the assistant asked to use here and the teacher has not
 * allowed yet. Checked when the chat opens and after every turn; Allow saves the grant
 * (plugin_grant on the server) and then tells the assistant in the chat, so it carries on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginInfo } from '@edw/shared';
import type { SessionApi } from '../api/participant';
import type { Envelope } from '../api/types';

/** The plugins asked for and not yet allowed (or dismissed with Not now). */
export function pendingRequests(plugins: readonly PluginInfo[], dismissed: ReadonlySet<string>): PluginInfo[] {
  return plugins.filter((p) => p.trust === 'ask' && p.requested && !p.allowed && !dismissed.has(p.id));
}

/** The message sent for the teacher once they allow a plugin. */
export const allowedMessage = (name: string) => `Yes, you can use ${name} in this chat.`;

export function usePluginRequests({ api, threadId, getEnvelope, sending, send }: { api: Pick<SessionApi, 'listPlugins' | 'allowPlugin'>; threadId: string; getEnvelope: () => Envelope; sending: boolean; send: (text: string) => void }) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const wasSending = useRef(sending);
  // Keyed on the calls, not the api object, so a caller that builds a new object each render does not loop.
  const { listPlugins, allowPlugin } = api;

  const load = useCallback(() => {
    if (!listPlugins) return;
    listPlugins(threadId)
      .then((ps) => setPlugins(Array.isArray(ps) ? ps : []))
      .catch(() => undefined);
  }, [listPlugins, threadId]);

  useEffect(() => {
    setPlugins([]);
    setDismissed(new Set());
    load();
  }, [load]);

  // A turn has just ended: it may have asked for one.
  useEffect(() => {
    if (wasSending.current && !sending) load();
    wasSending.current = sending;
  }, [sending, load]);

  const allow = useCallback(
    async (p: PluginInfo) => {
      if (!allowPlugin) return;
      const saved = await allowPlugin(p.id, threadId, getEnvelope());
      setPlugins((ps) => ps.map((x) => (x.id === p.id ? saved : x)));
      send(allowedMessage(p.name));
    },
    [allowPlugin, threadId, getEnvelope, send],
  );
  const dismiss = useCallback((id: string) => setDismissed((d) => new Set([...d, id])), []);

  return { pending: pendingRequests(plugins, dismissed), allow, dismiss };
}
