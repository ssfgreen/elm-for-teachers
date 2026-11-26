import { describe, expect, it } from "vitest";
import { ChatPromptPayload } from "./chat.js";

describe("chat_prompt: plugins on offer", () => {
  const base = { turn_id: "t1", text: "Find a simile game", anchor: null };

  it("marks a studio draft with draft and its content hash, null when it could not be read (#159)", () => {
    const plugins = [
      { id: "arasaac", trust: "use" },
      { id: "d-ab12cd34", trust: "ask", draft: true, content_hash: "sha256:" + "a".repeat(64) },
      { id: "d-ef56gh78", trust: "ask", draft: true, content_hash: null },
    ];
    expect(ChatPromptPayload.parse({ ...base, plugins }).plugins).toEqual(plugins);
  });

  it("still parses earlier events, with no draft marks or no plugins at all", () => {
    expect(ChatPromptPayload.safeParse({ ...base, plugins: [{ id: "arasaac", trust: "ask" }] }).success).toBe(true);
    expect(ChatPromptPayload.safeParse(base).success).toBe(true);
    expect(ChatPromptPayload.safeParse({ ...base, plugins: [{ id: "d-x", trust: "ask", draft: false }] }).success).toBe(false);
  });
});
