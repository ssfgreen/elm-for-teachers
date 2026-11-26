import type { APIRequestContext } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };
const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });

/**
 * A workspace with pupils on (the admin's switch; the e2e server has PUPILS=on), the demo class
 * in it, and a class code the teacher made through the route (#209).
 */
export async function pupilClass(request: APIRequestContext, label = "E2E pupils"): Promise<{ code: string; className: string; classId: string; sessionId: string; token: string }> {
  const made = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `${label} ${Date.now()}` } });
  const { session } = (await made.json()) as { session: { session_id: string; participant_token: string } };
  const sid = session.session_id;
  const teacher = { Authorization: `Bearer ${session.participant_token}` };
  await request.put(`/api/admin/sessions/${sid}/features`, { headers: ADMIN, data: { features: { pupils: true } } });
  const cls = (await (await request.post(`/api/sessions/${sid}/classes/demo`, { headers: teacher, data: { envelope: envelope() } })).json()) as { class: { id: string; name: string } };
  const res = await request.post(`/api/sessions/${sid}/classes/${cls.class.id}/code`, { headers: teacher, data: { action: "make", envelope: envelope() } });
  const { code } = (await res.json()) as { code: string };
  return { code, className: cls.class.name, classId: cls.class.id, sessionId: sid, token: session.participant_token };
}
