import { ulid } from "ulid";

/** Ids for blocks, docs, threads and events. */
export function newUlid(): string {
  return ulid();
}

export function newTurnId(): string {
  return `t_${ulid()}`;
}

export function newGatewayCallId(): string {
  return `gw_${ulid()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
