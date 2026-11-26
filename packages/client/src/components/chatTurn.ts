/**
 * The chat's turn, and the messages queued behind it, as one value, so what the chat shows and
 * what Stop does can be read off a single state rather than several flags that change separately.
 *
 *   idle ──start──▶ running ──stop──▶ stopping
 *    ▲                 │                  │
 *    └──────end────────┴───────end────────┘
 *
 * `running` is "thinking" until the first text arrives (`raw` is ''). `stopping` keeps the reply
 * where the teacher saw it: text that still arrives is ignored, and that text is what the server
 * is told was shown. Pure: the store below is the only thing that holds it.
 */
import { splitStreamingReply, type CommentAnchor, type TurnStep } from '@edw/shared';

/** The chat and doc a turn was sent from: where its edits go, whatever the teacher opens next. */
export interface TurnTarget {
  threadId: string;
  docId: string;
}

interface Under extends TurnTarget {
  /** Cuts the request off. */
  controller: AbortController;
  /** The server's id for the turn, once the stream names it (needed to log a Stop). */
  turnId: string | null;
  /** The model's raw reply so far: its text, then its edits as a fenced block. */
  raw: string;
  /** What the model is doing, in agent mode ("Reading “Similes”"). */
  status: string | null;
  steps: TurnStep[];
}

export type ChatTurn = { phase: 'idle' } | ({ phase: 'running' } & Under) | ({ phase: 'stopping' } & Under);

export type TurnAction =
  | ({ type: 'start'; controller: AbortController } & TurnTarget)
  | { type: 'named'; turnId: string }
  | { type: 'text'; raw: string }
  | { type: 'agent'; raw: string; status: string | null; steps: TurnStep[] }
  | { type: 'stop' }
  | { type: 'end' };

export const IDLE: ChatTurn = { phase: 'idle' };

/** The next state. An action that does not fit the current one returns it unchanged. */
export function turnReducer(turn: ChatTurn, action: TurnAction): ChatTurn {
  switch (action.type) {
    case 'start':
      // One turn at a time: a second send while one is under way is refused.
      if (turn.phase !== 'idle') return turn;
      return { phase: 'running', threadId: action.threadId, docId: action.docId, controller: action.controller, turnId: null, raw: '', status: null, steps: [] };
    case 'named':
      return turn.phase === 'idle' ? turn : { ...turn, turnId: action.turnId };
    case 'text':
      return turn.phase === 'running' ? { ...turn, raw: action.raw } : turn;
    case 'agent':
      return turn.phase === 'running' ? { ...turn, raw: action.raw, status: action.status, steps: action.steps } : turn;
    case 'stop':
      return turn.phase === 'running' ? { ...turn, phase: 'stopping' } : turn;
    case 'end':
      return IDLE;
  }
}

/**
 * A message sent while a reply was on its way: it waits, in order, and goes when the turn ends
 * (however it ends: finished, failed or stopped). The teacher can cancel it until then.
 */
export interface QueuedMessage {
  key: string;
  prompt: string;
  /** The doc open when it was queued: it goes about that doc, whatever is open later. */
  docId: string;
  about: CommentAnchor | null;
  attached: { id: string; name: string }[];
  /** Puts the teacher's text back if it cannot be sent. */
  onFail: () => void;
}

export interface ChatState {
  turn: ChatTurn;
  queue: QueuedMessage[];
}

export type ChatAction = TurnAction | { type: 'queue'; message: QueuedMessage } | { type: 'cancel'; key: string } | { type: 'dequeue'; key: string };

export const EMPTY: ChatState = { turn: IDLE, queue: [] };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'queue':
      return { ...state, queue: [...state.queue, action.message] };
    case 'cancel':
    case 'dequeue': {
      const queue = state.queue.filter((m) => m.key !== action.key);
      return queue.length === state.queue.length ? state : { ...state, queue };
    }
    default: {
      const turn = turnReducer(state.turn, action);
      return turn === state.turn ? state : { ...state, turn };
    }
  }
}

/** The reply's text as far as the teacher has seen it (without the edits block). */
export const shownText = (turn: ChatTurn) => (turn.phase === 'idle' ? '' : splitStreamingReply(turn.raw).message);

export interface ChatStore {
  get(): ChatState;
  subscribe(listener: () => void): () => void;
  dispatch(action: ChatAction): ChatState;
}

/** Holds the chat's state outside React's render, so a send or Stop sees it as it is now. */
export function createChatStore(): ChatStore {
  let state: ChatState = EMPTY;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      const next = chatReducer(state, action);
      if (next !== state) {
        state = next;
        for (const l of listeners) l();
      }
      return state;
    },
  };
}
