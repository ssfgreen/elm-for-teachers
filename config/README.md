# config

App configuration. The config and the system prompt are hashed into every session and bundle, so sessions run under different settings are never pooled.

- `app.config.json`: provider and sampling, chat history length, logging thresholds (validated by `AppConfig` in `packages/shared/src/config.ts`).
- `system_prompt_agent.md`: the assistant's system prompt in agent mode (`"mode": "agent"`: the model works through tools, reading and editing documents).
- `system_prompt.md`: the system prompt for single mode (`"mode": "single"`: one call per message, the edits in a fenced JSON block). To switch back, set `"mode": "single"` and `"system_prompt_file": "system_prompt.md"`.
- `skills/<name>/SKILL.md`: skills in the [Agent Skills](https://agentskills.io/specification) format. The frontmatter has a `name` (lowercase words joined by hyphens, the same as the folder's name) and a one-line `description` saying when to use the skill; the body holds the instructions. Other `.md`, `.txt`, `.csv` or `.json` files in the folder are references the instructions can point to. List a skill in `agent.skills` to offer it (agent mode only). Its description is then added to the system prompt, and the model loads the body with `read_skill` when a request matches. The skill files count towards `system_prompt_hash`, so editing a skill marks sessions as run under a different prompt. `dyslexia-friendly` is an example and is off by default.
- `sign-in-notice.json`: the "Before you start" notice a signed-in teacher ticks on their first visit to `/w` (title, paragraphs with their links, the tick box's and the button's labels). The client reads it when it is built (`packages/client/src/state/account.ts`); the server does not, and it is not part of `config_hash`. It is shown to anyone whose ticked version is not the file's `version`: when the text changes, change `version` too (any string up to 40 characters), or nobody sees the new text.

Other agent and history settings in `app.config.json`:

- `agent.max_read_chars`: the most of a document (or any tool output) the model gets at once; longer documents come in pages of whole blocks.
- `history.max_turns` / `history.keep_turns`: once more than `max_turns` turns are past the summary, all but the last `keep_turns` are folded into it.
- `reader`: the pupil reader (#177). `default_prompts` are the prompts a workspace's prompt library starts with (a button label, the hidden instruction for the model, and the ticks "after a highlight" and "as a follow-up"). `pupil_budget_gbp` (what one pupil may spend), `follow_ups_max` (follow-ups after one answer) and `model` (unset: the provider's default; it needs a price) are read by later reader items. `safety_instruction` (#195) is the default text the reader's model is told about keeping pupils safe; a class can keep its own version on its page. Never empty; left out, the built-in text in `shared/src/readerPrompts.ts` is used.
- `history.summary`: `model` (a structured summary written by the model) or `lines` (one line per turn, with no model call).

