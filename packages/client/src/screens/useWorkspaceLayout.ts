import { useCallback, useEffect, useRef, useState } from 'react';
import { useSplitWidth } from '../components/Splitter';
import { readStore, writeStore } from '../lib/store';
import { DOCK_QUERY, SPLIT_QUERY, useMediaQuery } from '../lib/useMediaQuery';

const CHAT_MIN = 300;
const CHAT_DEFAULT = 400;
/** The sidebar, open: 260px to start, between 200 and 440px. */
const SIDEBAR_DEFAULT = 260;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 440;
const maxSidebar = () => SIDEBAR_MAX;
/** The comments column: about 300px to start, between 240 and 560px. */
const COMMENTS_DEFAULT = 300;
const COMMENTS_MIN = 240;
const COMMENTS_MAX = 560;
const maxComments = () => COMMENTS_MAX;
const SIDEBAR_KEY = 'edw.threadsOpen';
const COMMENTS_KEY = 'edw.commentsOpen';
const CHAT_SHARE_KEY = 'edw.chatShare';

/** With the editor over the chat, the chat's share of the height: a third to start, 20% to 80%. */
export const CHAT_SHARE = { initial: 1 / 3, min: 0.2, max: 0.8 } as const;
export function clampShare(share: number): number {
  if (!Number.isFinite(share)) return CHAT_SHARE.initial;
  return Math.min(CHAT_SHARE.max, Math.max(CHAT_SHARE.min, share));
}

/**
 * The workspace's panes. From 1000px wide the sidebar and comments sit beside the panes and
 * whether they are open is remembered; narrower, they are drawers over the panes, closed to
 * start and not remembered. Below 820px the editor sits over the chat (`stacked`), split by
 * a share of the height that is remembered. Widths are remembered per browser.
 */
export function useWorkspaceLayout() {
  const docked = useMediaQuery(DOCK_QUERY);
  const stacked = !useMediaQuery(SPLIT_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(() => readStore(SIDEBAR_KEY) !== 'closed');
  const [commentsOpen, setCommentsOpen] = useState(() => readStore(COMMENTS_KEY) !== 'closed');
  const [drawer, setDrawer] = useState<'sidebar' | 'comments' | null>(null);
  // A drawer left open while the window widens would come back when it narrows again.
  useEffect(() => {
    if (docked) setDrawer(null);
  }, [docked]);

  const toggleSidebar = useCallback(() => {
    if (!docked) {
      setDrawer((d) => (d === 'sidebar' ? null : 'sidebar'));
      return;
    }
    setSidebarOpen((o) => {
      writeStore(SIDEBAR_KEY, o ? 'closed' : 'open');
      return !o;
    });
  }, [docked]);
  /** Something picked in the sidebar: a drawer closes so it can be seen. */
  const picked = useCallback(() => setDrawer((d) => (d === 'sidebar' ? null : d)), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const setCommentsColumn = useCallback(
    (value: boolean) => {
      if (!docked) {
        setDrawer((d) => (value ? 'comments' : d === 'comments' ? null : d));
        return;
      }
      setCommentsOpen(value);
      writeStore(COMMENTS_KEY, value ? 'open' : 'closed');
    },
    [docked],
  );
  /** Opens the column for comments the model left, without changing what is remembered. A drawer stays shut: it would cover the document. */
  const showComments = useCallback(() => {
    if (docked) setCommentsOpen(true);
  }, [docked]);

  const [chatShare, setChatShareState] = useState(() => clampShare(Number(readStore(CHAT_SHARE_KEY) ?? CHAT_SHARE.initial)));
  const setChatShare = useCallback((share: number) => {
    const next = clampShare(share);
    setChatShareState(next);
    writeStore(CHAT_SHARE_KEY, next.toFixed(3));
  }, []);

  const workspaceRef = useRef<HTMLElement | null>(null);
  const maxChat = useCallback(() => Math.max(CHAT_MIN, (workspaceRef.current?.clientWidth ?? 1400) * 0.5), []);
  const chat = useSplitWidth('edw.chatWidth', CHAT_DEFAULT, CHAT_MIN, maxChat);
  const sidebar = useSplitWidth('edw.sidebarWidth', SIDEBAR_DEFAULT, SIDEBAR_MIN, maxSidebar);
  const comments = useSplitWidth('edw.commentsWidth', COMMENTS_DEFAULT, COMMENTS_MIN, maxComments);

  return {
    workspaceRef,
    docked,
    stacked,
    closeDrawer,
    drawerOpen: drawer !== null,
    sidebar: { open: docked ? sidebarOpen : drawer === 'sidebar', toggle: toggleSidebar, picked, width: sidebar.width, setWidth: sidebar.setWidth, min: SIDEBAR_MIN, max: SIDEBAR_MAX },
    chat: { width: chat.width, setWidth: chat.setWidth, min: CHAT_MIN, max: maxChat, share: chatShare, setShare: setChatShare },
    comments: { open: docked ? commentsOpen : drawer === 'comments', setOpen: setCommentsColumn, show: showComments, width: comments.width, setWidth: comments.setWidth, min: COMMENTS_MIN, max: COMMENTS_MAX },
  };
}
