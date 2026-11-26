import type { Row } from './types.js';
import { Block, BlockRevision, Doc, Event, Project, Thread } from '@edw/shared';

function parseJson(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  return JSON.parse(String(v));
}
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => Number(v);

export function rowToBlock(row: Row): Block {
  return Block.parse({
    id: row.id,
    session_id: row.session_id,
    doc_id: row.doc_id,
    type: row.type,
    content: row.content,
    origin: row.origin,
    origin_turn: str(row.origin_turn),
    status: row.status,
    version: num(row.version),
    derived_from: str(row.derived_from),
    order: num(row.order),
    pending: parseJson(row.pending),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function blockToRow(block: Block): Record<string, string | number | null> {
  return {
    id: block.id,
    session_id: block.session_id,
    doc_id: block.doc_id,
    type: block.type,
    content: block.content,
    origin: block.origin,
    origin_turn: block.origin_turn,
    status: block.status,
    version: block.version,
    derived_from: block.derived_from,
    order: block.order,
    pending: block.pending === null ? null : JSON.stringify(block.pending),
    created_at: block.created_at,
    updated_at: block.updated_at,
  };
}

export function rowToDoc(row: Row): Doc {
  return Doc.parse({
    id: row.id,
    session_id: row.session_id,
    thread_id: row.thread_id,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at,
    ...(row.style ? { style: JSON.parse(String(row.style)) } : {}),
    ...(row.proposed_style ? { proposed_style: JSON.parse(String(row.proposed_style)) } : {}),
    ...(row.deleted_at ? { deleted_at: row.deleted_at } : {}),
  });
}

export function docToRow(d: Doc): Record<string, string | null> {
  return { id: d.id, session_id: d.session_id, thread_id: d.thread_id, name: d.name, created_by: d.created_by, created_at: d.created_at, style: d.style ? JSON.stringify(d.style) : null, proposed_style: d.proposed_style ? JSON.stringify(d.proposed_style) : null, deleted_at: d.deleted_at ?? null };
}

export function rowToThread(row: Row): Thread {
  return Thread.parse({
    id: row.id,
    session_id: row.session_id,
    title: row.title,
    project_id: str(row.project_id),
    class_id: str(row.class_id),
    year_group_id: str(row.year_group_id),
    needs_group_id: str(row.needs_group_id),
    created_at: row.created_at,
  });
}

export function rowToProject(row: Row): Project {
  return Project.parse({
    id: row.id,
    session_id: row.session_id,
    name: row.name,
    description: str(row.description),
    instructions: str(row.instructions),
    created_at: row.created_at,
    archived_at: str(row.archived_at),
    deleted_at: str(row.deleted_at),
  });
}

export function rowToEvent(row: Row): Event {
  return Event.parse({
    session_id: row.session_id,
    seq: num(row.seq),
    event_id: row.event_id,
    kind: row.kind,
    client_ts: row.client_ts,
    server_ts: row.server_ts,
    focus_pane: row.focus_pane,
    doc_id: str(row.doc_id),
    thread_id: str(row.thread_id),
    payload: parseJson(row.payload),
  });
}

export function eventToRow(e: Event): Record<string, string | number | null> {
  return {
    session_id: e.session_id,
    seq: e.seq,
    event_id: e.event_id,
    kind: e.kind,
    client_ts: e.client_ts,
    server_ts: e.server_ts,
    focus_pane: e.focus_pane,
    doc_id: e.doc_id,
    thread_id: e.thread_id,
    payload: JSON.stringify(e.payload),
  };
}

export function rowToRevision(row: Row): BlockRevision {
  return BlockRevision.parse({
    block_id: row.block_id,
    version: num(row.version),
    actor: row.actor,
    before: parseJson(row.before),
    after: parseJson(row.after),
    cause_event_id: row.cause_event_id,
    at: row.at,
  });
}

export function revisionToRow(r: BlockRevision): Record<string, string | number | null> {
  return {
    block_id: r.block_id,
    version: r.version,
    actor: r.actor,
    before: r.before === null ? null : JSON.stringify(r.before),
    after: JSON.stringify(r.after),
    cause_event_id: r.cause_event_id,
    at: r.at,
  };
}
