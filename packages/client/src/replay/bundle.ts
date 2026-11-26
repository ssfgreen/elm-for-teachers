/**
 * Reads an exported session bundle (the /admin zip, or the export.json file map) into what the
 * replay needs. Only the files the replay uses are read; the bundle's shape is in
 * shared/src/bundle.ts and is not changed here.
 */
import JSZip from 'jszip';
import type { BlockType, Comment } from '@edw/shared';
import type { ChatTurn } from '../api/types';

/** One line of events.jsonl, with its client time as epoch ms in `t`. */
export interface ReplayEvent {
  t: number;
  seq: number;
  kind: string;
  thread_id: string | null;
  doc_id: string | null;
  focus_pane: string;
  // Payloads differ by kind; readers narrow what they use.
  payload: Record<string, unknown>;
}

/** One line of text_events.jsonl: a change to one block's text, or a block's structure. */
export interface TextEvent {
  eventNum: number;
  eventName: string;
  eventTimestamp: number;
  block_id: string;
  doc_id: string;
  textDelta?: { ops: unknown[] };
  detail?: Record<string, unknown>;
}

export interface BundleBlock {
  id: string;
  doc_id: string;
  type: BlockType;
  order: number;
}
export interface BundleDoc {
  id: string;
  name: string;
  thread_id: string;
  created_by?: 'teacher' | 'model';
  created_at?: string;
}
export interface BundleThread {
  id: string;
  title: string;
  project_id?: string | null;
  created_at?: string;
}
/** A line of chat_turns.jsonl: a turn as the chat loads it, with its chat. */
export type BundleTurn = ChatTurn & { thread_id: string };

export interface ReplayBundle {
  label: string;
  events: ReplayEvent[];
  textEvents: TextEvent[];
  blocks: BundleBlock[];
  docs: BundleDoc[];
  threads: BundleThread[];
  turns: BundleTurn[];
  comments: Comment[];
}

export class BundleError extends Error {}

const jsonl = (text: string | undefined): unknown[] =>
  (text ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as unknown);

const json = <T>(text: string | undefined, fallback: T): T => (text ? (JSON.parse(text) as T) : fallback);

type RawEvent = Omit<ReplayEvent, 't'> & { client_ts: string; server_ts?: string };

/**
 * Written by the server when a model turn ends, but stamped with the prompt's client time: their
 * moment on screen is `server_ts` (the two clocks agree to a fraction of a second).
 */
const SERVER_TIMED = new Set(['chat_response', 'proposal_shown', 'spyglass_shown', 'asset_upload', 'chat_title', 'thread_rename']);

/** The bundle from its files, by path as in MANIFEST.json. Events come back in time order. */
export function parseBundle(files: Record<string, string | undefined>): ReplayBundle {
  if (!files['events.jsonl']) throw new BundleError('This is not a session bundle: it has no events.jsonl.');
  const events = (jsonl(files['events.jsonl']) as RawEvent[])
    .map(({ client_ts, server_ts, ...e }) => ({
      ...e,
      t: Date.parse(SERVER_TIMED.has(e.kind) && server_ts ? server_ts : client_ts),
    }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t || a.seq - b.seq);
  const session = json<{ label?: string }>(files['session.json'], {});
  return {
    label: session.label ?? 'Workspace',
    events,
    textEvents: (jsonl(files['text_events.jsonl']) as TextEvent[]).sort((a, b) => a.eventNum - b.eventNum),
    blocks: json<BundleBlock[]>(files['blocks.json'], []),
    docs: json<BundleDoc[]>(files['docs.json'], []),
    threads: json<BundleThread[]>(files['threads.json'], []),
    turns: jsonl(files['chat_turns.jsonl']) as BundleTurn[],
    comments: jsonl(files['comments.jsonl']) as Comment[],
  };
}

const NEEDED = ['events.jsonl', 'text_events.jsonl', 'blocks.json', 'docs.json', 'threads.json', 'session.json', 'chat_turns.jsonl', 'comments.jsonl'];

/** A bundle zip. Bundles zipped with a folder around them are read too. */
export async function readBundleZip(data: Blob | ArrayBuffer): Promise<ReplayBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new BundleError('That file could not be opened as a zip.');
  }
  const files: Record<string, string> = {};
  for (const path of Object.keys(zip.files)) {
    const name = NEEDED.find((n) => path === n || path.endsWith(`/${n}`));
    const entry = zip.files[path];
    if (name && entry && !entry.dir && !(name in files)) files[name] = await entry.async('string');
  }
  return parseBundle(files);
}
