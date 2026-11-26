/**
 * Runs the real client screens (jsdom) against the real built server with the
 * mock provider: an admin creates a workspace link; the teacher's screen opens
 * it, chats, accepts the proposals, starts a second chat and a second doc; the
 * export holds it all. Catches request and response mismatches between the two
 * packages.
 *
 * Requires `pnpm --filter @edw/server build`. Skipped unless EDW_INTEGRATION=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ParticipantApp } from "../screens/ParticipantApp.js";
import { setFetch } from "../api/http.js";
import { installEditorPolyfills, installIntersectionObserver } from "../test-utils.js";

const enabled = process.env.EDW_INTEGRATION === "1";
const PASSWORD = "integration-pw";
const PORT = 3900 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const serverEntry = join(__dirname, "..", "..", "..", "server", "dist", "index.js");

let child: ChildProcess | null = null;
/** The open doc's name and the open chat's title (documents and replies have headings of their own). */
const docTitle = () => document.querySelector(".doc-title")?.textContent ?? null;
const chatTitle = () => document.querySelector(".chat-title")?.textContent ?? null;
let dir = "";
const realFetch = globalThis.fetch;

async function adminApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await realFetch(`${BASE}/api/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${PASSWORD}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function participantCanvas(sessionId: string, token: string) {
  const res = await realFetch(`${BASE}/api/sessions/${sessionId}/canvas`, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()) as { blocks: Array<{ status: string; content: string; doc_id: string }>; docs: Array<{ id: string; thread_id: string; name: string }> };
}

describe.skipIf(!enabled)("live client against the built server", () => {
  beforeAll(async () => {
    installIntersectionObserver();
    installEditorPolyfills();
    dir = mkdtempSync(join(tmpdir(), "edw-int-"));
    child = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        DATABASE_URL: `file:${join(dir, "int.db")}`,
        DATABASE_AUTH_TOKEN: "",
        PROVIDER: "mock",
        ELM_PROXY_BASE_URL: "",
        ELM_PROXY_API_KEY: "",
        ADMIN_PASSWORD: PASSWORD,
        CONSOLE_PASSWORD: "",
        PORT: String(PORT),
        HOST: "127.0.0.1",
        PUBLIC_BASE_URL: BASE,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += String(d)));
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        const r = await realFetch(`${BASE}/api/health`);
        if (r.ok) break;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) throw new Error(`server did not start: ${stderr}`);
      await new Promise((r) => setTimeout(r, 250));
    }
    // Relative /api URLs from the client resolve against the test server.
    const absolute: typeof fetch = async (input, init) => {
      const url = typeof input === "string" && input.startsWith("/") ? `${BASE}${input}` : input;
      const res = await realFetch(url as string, init);
      if (!res.ok) {
        const body = await res.clone().text();
        console.error(`[integration] ${init?.method ?? "GET"} ${String(url)} -> ${res.status}: ${body.slice(0, 600)}`);
      }
      return res;
    };
    setFetch(absolute);
    globalThis.fetch = absolute;
  }, 40_000);

  afterAll(() => {
    cleanup();
    setFetch(null);
    globalThis.fetch = realFetch;
    child?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it(
    "a workspace link opens on a blank doc; chat fills it; a second chat and doc are kept apart; the export has it all",
    async () => {
      const created = await adminApi<{ session: { session_id: string; participant_token: string }; participant_url: string }>("POST", "/sessions", { label: "Integration" });
      const { session_id: sid, participant_token: token } = created.session;
      expect(created.participant_url).toBe(`${BASE}/s/${token}`);

      const ui = render(
        <MemoryRouter initialEntries={[`/s/${token}`]}>
          <Routes>
            <Route path="/s/:token" element={<ParticipantApp />} />
          </Routes>
        </MemoryRouter>,
      );

      // The link opens on the first chat's blank doc; nothing is in it on the server until the teacher types.
      await waitFor(() => expect(docTitle()).toBe("Untitled"), { timeout: 10_000 });
      await waitFor(() => expect(ui.container.querySelector(".canvas-pm > p")).not.toBeNull(), { timeout: 10_000 });
      const first = await participantCanvas(sid, token);
      expect(first.blocks).toHaveLength(0);
      expect(first.docs).toHaveLength(1);
      const firstDoc = first.docs[0]!;
      expect((await adminApi<{ sessions: Array<{ first_opened_at: string | null }> }>("GET", "/sessions")).sessions[0]!.first_opened_at).not.toBeNull();

      // Chat: ask for the worksheet; the mock provider writes it into the open doc.
      const chatEl = screen.getByLabelText("Chat");
      const chat = within(chatEl);
      await act(async () => {
        fireEvent.change(chat.getByLabelText("Message"), { target: { value: "Please write the worksheet on metaphors and similes" } });
      });
      await act(async () => {
        fireEvent.click(chat.getByRole("button", { name: /send/i }));
      });
      await waitFor(() => expect(chatEl.textContent).toMatch(/draft worksheet/i), { timeout: 15_000 });
      // The chat stays Untitled until the teacher names it.
      expect(chatTitle()).toBe("Untitled");
      fireEvent.doubleClick(document.querySelector(".chat-title")!);
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Chat name"), { target: { value: "Metaphors P7" } });
        fireEvent.keyDown(screen.getByLabelText("Chat name"), { key: "Enter" });
      });
      await waitFor(() => expect(chatTitle()).toBe("Metaphors P7"));

      // The doc was blank, so the worksheet went straight in: it is in the doc, with nothing to accept.
      await waitFor(() => expect(ui.container.querySelectorAll(".canvas-pm > h1, .canvas-pm > h2").length).toBeGreaterThan(0), { timeout: 10_000 });
      // While the reply streams the blocks are drawn as a preview; once it is in, nothing waits.
      await waitFor(() => expect(ui.container.querySelectorAll(".canvas-pm > .st-proposed")).toHaveLength(0), { timeout: 10_000 });
      expect(ui.container.querySelectorAll(".suggestion-card")).toHaveLength(0);
      expect(screen.queryByRole("toolbar", { name: "Suggestions" })).toBeNull();
      const filled = await participantCanvas(sid, token);
      expect(filled.blocks.filter((b) => b.status === "live" && b.doc_id === firstDoc.id).length).toBeGreaterThanOrEqual(12);
      expect(filled.blocks.some((b) => b.status === "proposed")).toBe(false);

      // Now the doc has text in it, a change is a suggestion: asked to make it easier, the mock
      // adds a support section. It arrives with the toolbar, drawn as suggestions; accept them all.
      await act(async () => {
        fireEvent.change(chat.getByLabelText("Message"), { target: { value: "Please make it easier for my class" } });
      });
      await act(async () => {
        fireEvent.click(chat.getByRole("button", { name: /send/i }));
      });
      await waitFor(() => expect(screen.getByRole("toolbar", { name: "Suggestions" })).toBeTruthy(), { timeout: 15_000 });
      expect(ui.container.querySelectorAll(".canvas-pm > .st-proposed, .canvas-pm > ul > .st-proposed, .canvas-pm .st-proposed").length).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
      });
      await waitFor(() => expect(ui.container.querySelectorAll(".canvas-pm .st-proposed").length).toBe(0), { timeout: 5_000 });
      await waitFor(async () => {
        const c = await participantCanvas(sid, token);
        expect(c.blocks.filter((b) => b.status === "live" && b.doc_id === firstDoc.id).length).toBeGreaterThanOrEqual(14);
        expect(c.blocks.some((b) => b.status === "proposed")).toBe(false);
      }, { timeout: 10_000 });

      // Rename the doc.
      fireEvent.doubleClick(document.querySelector(".doc-title")!);
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Document name"), { target: { value: "Similes P7" } });
        fireEvent.keyDown(screen.getByLabelText("Document name"), { key: "Enter" });
      });
      await waitFor(async () => expect((await participantCanvas(sid, token)).docs[0]!.name).toBe("Similes P7"), { timeout: 5_000 });

      // A new chat starts on its own blank doc, and the model there sees none of the first chat's text.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "New chat" }));
      });
      await waitFor(() => expect(docTitle()).toBe("Untitled"), { timeout: 10_000 });
      const second = await participantCanvas(sid, token);
      expect(second.docs).toHaveLength(2);
      expect(new Set(second.docs.map((d) => d.thread_id)).size).toBe(2);

      // + makes another blank doc in this chat.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Create new" }));
      });
      await waitFor(async () => expect((await participantCanvas(sid, token)).docs).toHaveLength(3), { timeout: 5_000 });

      // The sidebar lists both chats; clicking the first switches back to it.
      await act(async () => {
        fireEvent.click(within(screen.getByRole("region", { name: "Chats list" })).getByRole("button", { name: "Metaphors P7" }));
      });
      expect(chatTitle()).toBe("Metaphors P7");
      await waitFor(() => expect(within(screen.getByLabelText("Chat")).getByText(/draft worksheet/i)).toBeTruthy(), { timeout: 10_000 });

      // Export from the admin API.
      const exp = await realFetch(`${BASE}/api/admin/sessions/${sid}/export.json`, { headers: { Authorization: `Bearer ${PASSWORD}` } });
      expect(exp.ok).toBe(true);
      const files = (await exp.json()) as Record<string, string>;
      expect(files["docs/01-similes-p7.md"]).toMatch(/Metaphors and Similes/);
      expect(Object.keys(files).filter((f) => f.startsWith("docs/"))).toHaveLength(3);
      await waitFor(async () => {
        const again = (await (await realFetch(`${BASE}/api/admin/sessions/${sid}/export.json`, { headers: { Authorization: `Bearer ${PASSWORD}` } })).json()) as Record<string, string>;
        const kinds = new Set(again["events.jsonl"]!.trim().split("\n").map((l) => (JSON.parse(l) as { kind: string }).kind));
        for (const k of ["thread_create", "thread_rename", "doc_create", "doc_rename", "doc_open", "thread_open", "chat_prompt", "chat_response", "proposal_shown", "proposal_accept", "block_revision"]) {
          expect(kinds, `event kind ${k}`).toContain(k);
        }
      }, { timeout: 10_000 });
      const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as { seq: number });
      expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    },
    120_000,
  );
});
