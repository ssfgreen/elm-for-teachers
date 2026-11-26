/** Workspace needs groups API (T1): generic or class-assigned groups of learning needs. */
import type { AdaptationPick, AdaptationStatus, NeedsGroupAdaptation, NeedsGroupInput, NeedsGroupSummary, NeedsGroupUpdate } from '@edw/shared';
import { endpoints } from './endpoints';
import { api, type ApiOptions } from './http';
import type { Envelope } from './types';

export interface NeedsGroupsApi {
  listNeedsGroups(): Promise<NeedsGroupSummary[]>;
  createNeedsGroup(input: NeedsGroupInput, envelope: Envelope): Promise<NeedsGroupSummary>;
  updateNeedsGroup(groupId: string, patch: NeedsGroupUpdate, envelope: Envelope): Promise<NeedsGroupSummary>;
  archiveNeedsGroup(groupId: string, envelope: Envelope): Promise<NeedsGroupSummary>;
  attachNeedsGroupClass(groupId: string, classId: string, envelope: Envelope): Promise<NeedsGroupSummary>;
  detachNeedsGroupClass(groupId: string, classId: string): Promise<NeedsGroupSummary>;
  addNeedsGroupAdaptation(groupId: string, pick: AdaptationPick, envelope: Envelope): Promise<NeedsGroupAdaptation>;
  updateNeedsGroupAdaptation(groupId: string, adaptationId: string, fields: { status?: AdaptationStatus; overrides?: string | null }, envelope: Envelope): Promise<NeedsGroupAdaptation>;
  removeNeedsGroupAdaptation(groupId: string, adaptationId: string, envelope: Envelope): Promise<NeedsGroupAdaptation>;
}

export function needsGroupsApi(sessionId: string, opts: ApiOptions): NeedsGroupsApi {
  return {
    listNeedsGroups: () => api<{ groups: NeedsGroupSummary[] }>('GET', endpoints.needsGroups(sessionId), undefined, opts).then((r) => r.groups),
    createNeedsGroup: (input, envelope) =>
      api<{ group: NeedsGroupSummary }>('POST', endpoints.needsGroups(sessionId), { ...input, envelope }, opts).then((r) => r.group),
    updateNeedsGroup: (groupId, patch, envelope) =>
      api<{ group: NeedsGroupSummary }>('POST', endpoints.needsGroupAction(sessionId, groupId, 'update'), { ...patch, envelope }, opts).then((r) => r.group),
    archiveNeedsGroup: (groupId, envelope) =>
      api<{ group: NeedsGroupSummary }>('POST', endpoints.needsGroupAction(sessionId, groupId, 'archive'), { envelope }, opts).then((r) => r.group),
    attachNeedsGroupClass: (groupId, class_id, envelope) =>
      api<{ group: NeedsGroupSummary }>('POST', endpoints.needsGroupClasses(sessionId, groupId), { class_id, envelope }, opts).then((r) => r.group),
    detachNeedsGroupClass: (groupId, classId) =>
      api<{ group: NeedsGroupSummary }>('DELETE', endpoints.needsGroupClass(sessionId, groupId, classId), undefined, opts).then((r) => r.group),
    addNeedsGroupAdaptation: (groupId, pick, envelope) =>
      api<{ adaptation: NeedsGroupAdaptation }>('POST', endpoints.needsGroupAdaptations(sessionId, groupId), { ...pick, envelope }, opts).then((r) => r.adaptation),
    updateNeedsGroupAdaptation: (groupId, adaptationId, fields, envelope) =>
      api<{ adaptation: NeedsGroupAdaptation }>('POST', endpoints.needsGroupAdaptationAction(sessionId, groupId, adaptationId, 'update'), { ...fields, envelope }, opts).then((r) => r.adaptation),
    removeNeedsGroupAdaptation: (groupId, adaptationId, envelope) =>
      api<{ adaptation: NeedsGroupAdaptation }>('POST', endpoints.needsGroupAdaptationAction(sessionId, groupId, adaptationId, 'remove'), { envelope }, opts).then((r) => r.adaptation),
  };
}
