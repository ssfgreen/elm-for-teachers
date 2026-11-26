<!-- Deep research Sam commissioned (1 Nov 2026) on how practitioners evaluate agent skills, plugins and tools. Kept as given; PLAN.md section 5, P.4, draws on it. Claims are as the report states them, with its own caveats at the end. -->

# Building and Evaluating Agent Plugins, Skills and Tools: What Respected Practitioners Actually Do

Yes: as of November 2026 there is a mature, primary-sourced way to develop plugins and skills with evals, and its core is the same everywhere. You run realistic prompts several times with and without the extension, grade the outcome with cheap deterministic checks first and an LLM judge second, check separately that the extension actually fires, and track pass rate, tokens and time so you can delete it when the base model catches up. Anthropic (skill-creator, `claude plugin eval`, "Writing effective tools for agents"), OpenAI ("Testing Agent Skills Systematically with Evals"), Jesse Vincent (Superpowers) and Vercel all converge on this pattern. The minimalists (Zechner, Ronacher, Steinberger) mostly skip formal suites for personal tools, but when they make claims they too reach for repeated, baseline-controlled benchmarks.

## TL;DR

- **The consensus method is "with versus without, repeated, on realistic tasks".** Anthropic's skill-creator and `claude plugin eval` both run each case with and without the plugin (three runs per arm by default in `claude plugin eval`) and report the difference; OpenAI's guide captures `codex exec --json` traces and adds deterministic and rubric checks; Zechner ran 10 repetitions per task/tool pair in his MCP vs CLI benchmark.
- **Triggering is a separate failure mode and must be tested on its own.** Vercel found its Next.js skill was never invoked in 56% of eval cases and scored the same 53% as no docs, while a compressed 8KB docs index in AGENTS.md reached 100% (+47pp over baseline, per Vercel's "AGENTS.md outperforms skills in our agent evals"); Anthropic's description tuning improved triggering on 5 of 6 of its public document skills.
- **Recommended workflow:** write 3 or more baseline-failing evals before the skill, keep the skill minimal, grade with regex/tool-used checks plus a short rubric judge, gate CI on a threshold with pinned models, and rerun on every model release to decide whether to keep, rewrite or delete.

## Key Findings

1. **Official tooling now exists for every layer.** Anthropic ships skill-creator (Create, Eval, Improve, Benchmark modes; announced 3 March 2026) and a first-party `claude plugin eval` command (requires Claude Code v2.1.269 or later) with graders, MCP mocks, a no-plugin baseline, JSON results and CI exit codes. Anthropic's mcp-builder skill makes a 10-question XML evaluation part of building an MCP server. OpenAI publishes a Codex-centric recipe built on `codex exec --json` and `--output-schema`.
2. **Baseline comparison is the single most important design decision.** Anthropic's docs warn that "a high score on its own doesn't tell you the plugin helped, because Claude might do as well without it"; Superpowers' writing-skills rule is "If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing."
3. **Evals decide deletion, not just quality.** Anthropic explicitly frames capability-uplift skills as perishable: "If the base model starts passing your evals without the skill loaded, that's a signal the skill's techniques may have been incorporated into the model's default behavior."
4. **Skills are not free.** SkillsBench (arXiv 2602.12670, v4, June 2026) found that across 18 model-harness configurations curated skills lift task pass rate from 33.9% to 50.5% (+16.6pp); its earlier version reported that 16 of 84 tasks got worse and that self-generated skills gave no benefit (about -1.3pp). Vercel saw an unused skill score worse than baseline on some test metrics.
5. **Practitioners disagree mainly on how much ceremony personal tooling needs**, not on whether measurement matters. Ronacher and Steinberger favour agent-maintained CLI tools plus skill docs and throw them away freely; Vincent and Anthropic have moved to formal suites; Zechner benchmarks when making public claims.

## Details

### 1. Anthropic: skill-creator, plugin evals, tools and MCP

**Skill-creator (the in-conversation loop).** Anthropic's 3 March 2026 post says skill-creator now "helps you write evals, run benchmarks, and keep your skills working as models evolve", and distinguishes two kinds of skills: *capability uplift* (teaches something the model cannot do consistently, likely to become unnecessary) and *encoded preference* (sequences existing capabilities per your team's process, durable but only "as valuable as their fidelity to your actual workflow"). Concrete mechanics from the skill's own SKILL.md:

- Test prompts live in `evals/evals.json`; assertions are drafted while runs are in flight and must be "objectively verifiable and have descriptive names". Subjective skills (writing style, design) are reviewed qualitatively rather than forced into assertions.
- For each case it spawns two subagents in the same turn, one with the skill and one baseline (no skill for a new skill, or a snapshot of the old version when improving one).
- It captures `total_tokens` and `duration_ms` per run, grades into `grading.json`, and aggregates into `benchmark.json`/`benchmark.md` with "pass_rate, time, and tokens for each configuration, with mean ± stddev and the delta".
- An analyst pass looks for "assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs".
- Comparator agents do blind A/B judging of two versions or skill versus no skill; a description optimiser tunes triggering. Anthropic notes Claude tends to "undertrigger" skills and recommends slightly "pushy" descriptions.
- Revision guidance is anti-overfitting: generalise from feedback, "keep the prompt lean", read transcripts not just outputs, and bundle any helper script that every test run reinvented.

Anthropic's PDF skill is the worked example: evals isolated a failure with non-fillable forms, and the fix anchored positioning to extracted text coordinates.

**Skill authoring best practices (docs).** The platform docs say "Create evaluations BEFORE writing extensive documentation": identify gaps by running Claude without the skill, build three scenarios, measure the baseline, write minimal instructions, iterate. They recommend a "Claude A" (helps author) and "Claude B" (fresh instance with the skill loaded) loop, testing across Haiku, Sonnet and Opus, and a pre-share checklist including "At least three evaluations created" and a SKILL.md body under 500 lines.

**`claude plugin eval` (the CI-grade harness).** The Claude Code docs describe a full suite format for plugins (bundles of skills, hooks, agents and MCP servers):

- Each case is a directory under `evals/` with `prompt.md` (frontmatter such as `max_turns`, `allowed_tools`) and one or more graders under `graders/`. `claude plugin eval init` interviews you, proposes cases that should and should not trigger the plugin, trial-runs graders and writes the files; `--bare` writes a blank template.
- Six grader types: `regex`, `tool_used`, `tool_order` and `file_exists` are free; `llm` and `baseline` call a judge model. "There are no custom-code graders."
- Scoring: each case runs three times by default; a case passes when its score meets `--threshold` (default 1.0). Results show `WITH`, `W/OUT` and `Δ`. Graders that cannot pass without the plugin (for example `tool_used: Skill`) are excluded from scoring in both arms so they do not inflate `Δ`.
- The docs give unusually concrete grader advice: use `regex` for long outputs, keep `llm` graders for short outputs with explicit PASS/FAIL rubrics, pair one outcome grader with one process grader, and if `tool_used: Skill` passes but `Δ` is negative, "suspect the judge before the plugin".
- The most common first finding is "a `Δ` near zero with the case's `tool_used: Skill` grader failing, which means Claude isn't choosing your skill on natural phrasing".
- MCP servers are mocked by default with per-tool Markdown files under `evals/mocks/<server>/<tool>.md`, including `expect:` input contracts, error responses and agent-simulated servers whose answers can be recorded and replayed for repeatable CI.
- Isolation: each run gets a temporary home and config, nothing personal loads, the agent cannot read the eval directory, and Bash runs under the OS sandbox.
- CI recipe: `claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model … --judge-model … --no-publish --max-cost-usd 20`, with exit code 0 (pass), 1 (below threshold or failure), 2 (partial, e.g. cost ceiling). Pin both models "so a model rollout isn't mistaken for a plugin regression". The `Δ` "is reported but never changes the exit code".

Note that skill-creator and `claude plugin eval` use different case formats and "neither tool reads the other's case files"; choose one per project.

**Tools and MCP servers ("Writing effective tools for agents", Ken Aizawa et al., 11 September 2025).** The method: prototype, then generate "lots of evaluation tasks, grounded in real world uses" that may require "dozens" of tool calls; pair each with a verifiable outcome, avoiding verifiers so strict they reject correct answers on formatting; optionally record expected tool calls but avoid "overspecifying or overfitting to strategies". Run each task in a simple agent loop via the API and collect accuracy, runtime, number of tool calls, token consumption and tool errors. Then paste concatenated transcripts into Claude Code to refactor the tools, and check against held-out test sets to avoid overfitting. Their Slack and Asana tools improved beyond the human-written versions this way. Design principles derived from those evals include fewer, consolidated tools (`search_contacts` not `list_contacts`), namespacing, semantic identifiers over UUIDs, a `response_format` concise/detailed switch (about a third of the tokens in their Slack example), and the 25,000-token default cap on tool responses in Claude Code. An anecdote shows the value: evals revealed Claude needlessly appending "2025" to web search queries, fixed by editing the tool description.

**mcp-builder skill.** Phase 4 of Anthropic's mcp-builder requires 10 human-readable questions that are independent, read-only, non-destructive and idempotent, each requiring multiple (possibly dozens of) tool calls and with a single, stable, verifiable answer, stored as `<qa_pair>` entries in an XML file and run with the bundled `evaluation.py` harness.

### 2. OpenAI: Codex skills and AGENTS.md

OpenAI's "Testing Agent Skills Systematically with Evals" defines an eval as "a prompt → a captured run (trace + artifacts) → a small set of checks → a score you can compare over time", and says skill evals "look a lot like lightweight end-to-end tests". Its recipe:

- Define success first, separating outcome goals from **process goals** ("Did Codex invoke the skill and follow the tools and steps you intended?").
- Write separate cases for explicit invocation (by name or `$skill`) and implicit invocation, the latter testing "whether the name and description in SKILL.md are strong enough for Codex to select the skill on its own".
- Capture JSONL with `codex exec --json` and write deterministic checks against `command_execution` events (for example, did the agent run `npm install`).
- Add a rubric pass with `codex exec --output-schema` returning structured JSON (`overall_pass`, `score`, `checks[]`) for style and conventions.
- Let real failures drive new cases.

OpenAI's Harness engineering post (Ryan Lopopolo, 11 February 2026) supplies the wider context that Hamel Husain cites: the repository contains "on the order of a million lines of code" and "roughly 1,500 pull requests have been opened and merged with a small team of just three engineers driving Codex" (the team later grew to seven), built in an estimated "about 1/10th the time", and improving the infrastructure around the agent beat improving the model.

### 3. Jesse Vincent (obra/superpowers): TDD for skills, then formal evals

Vincent's method evolved in three visible stages, all primary-sourced on his blog and repo:

- **Pressure-testing with subagents (October 2025).** His writing-skills skill states "Writing skills IS Test-Driven Development applied to process documentation": write pressure scenarios, run subagents without the skill and record "exact rationalizations agent uses" (RED), write the skill (GREEN), then "Find new rationalizations → plug → re-verify" (REFACTOR). Pressure types include time, sunk cost, authority and economic stakes, and "Best tests combine 3+ pressures" because "Agents resist single pressure, break under multiple." Observed excuses go into an Excuse/Reality "rationalization table" inside the skill. The origin story is instructive: "Claude told me that the subagents had gotten a perfect score. After a bit of prodding, I discovered that Claude was quizzing the subagents like they were on a gameshow." Realistic pressure scenarios replaced quizzes. This approach targets *discipline* skills; pure reference skills are explicitly out of scope.
- **Trigger and end-to-end tests (late 2025).** Superpowers added `tests/explicit-skill-requests/`, `tests/skill-triggering/` (checks six skills fire from naive prompts that do not name them) and headless `claude -p` integration tests. Vincent described this in December 2025 as "not a proper evals suite" but basic end-to-end checks of the brainstorm, plan, implement flow. In November 2025 he framed evals as "a flaky test suite with confidence levels" and kept one test that "needs to pass 100% of the time": a fresh session asked "Let's make a react todo list."
- **Formal eval suites (2026).** Superpowers 6 (15 June 2026) credits a separate `superpowers-evals` suite at Prime Radiant, reporting up to 50% faster builds and up to 60% lower token spend, plus a pre-registered "autoresearch" loop of 25 experiments costing about $165. Release notes report a measured regression when a TDD section was deleted ("control 8/10 → treatment 5/10, corroborated on Claude and Codex") and warn against "the string-presence trap", i.e. grep-style tests on skill text, because "the observable is behavior, never text". A newer "micro-test wording" guideline states "Variance is a metric": if five repetitions produce five interpretations, the wording is not binding. Superpowers 6.4 (21 September 2026) used evals to compare subagent-driven, native and "bare metal" execution, finding native execution about twice as fast and half as expensive. With Simon Willison, Prime Radiant released **smevals** (31 July 2026), a small eval runner (`uvx smevals run path-to-eval/ -m gpt-5.5 -m claude-opus-4.6`, then `grade`) that separates runs from grading so outputs can be regraded.

He also found via testing that descriptions which summarise the workflow cause the agent to follow the description instead of the body (one review instead of two), so descriptions should state triggering conditions only.

### 4. Mario Zechner (pi): benchmark the claim, keep the harness minimal

- **MCP vs CLI benchmark (15 August 2025).** Zechner built `terminalcp` with both an MCP server and a CLI, then compared them against tmux and screen on three terminal-control tasks. His "super hacky" framework spawned a fresh Claude Code instance per run "with a clean config (no custom MCPs, no CLAUDE.md files)", ran each task/tool combination 10 times, captured `/cost` for time, tokens and cost, and used Claude as a judge to summarise and rank before manual analysis. Result: "MCP vs CLI truly is a wash", both 100% success, with MCP 23% faster and 2.5% cheaper, partly because CLI calls triggered Claude Code's per-command security check. His conclusion: "The protocol is just plumbing. What matters is whether your tool helps or hinders the agent's ability to complete tasks." He also deliberately gave each tool equivalent in-context documentation for fairness, and noted that the GitHub MCP server and Context7 often performed worse in his experience than the CLI or a sub-agent-generated manual (anecdotal, not benchmarked).
- **pi on Terminal-Bench 2.0.** Zechner ran pi (four tools, system prompt plus tool definitions under 1,000 tokens) with Claude Opus 4.5, five trials per task, and submitted results to the leaderboard; he reported 8th place at the time, with the caveat of a single full run, and published the runner (`pi-terminal-bench`). The lesson for extension authors is to measure the harness against a minimal baseline (Terminus 2 just gets a tmux session) before adding features.
- **pi extensions.** pi has no MCP and no built-in sub-agents; the philosophy, in Ronacher's description, is that "you ask the agent to extend itself" via hot-reloadable TypeScript extensions and skills. I found no published eval suite for individual pi extensions; evaluation is by use and by the harness-level benchmark.

### 5. Armin Ronacher: agent-maintained skills, measured by context cost

Ronacher's December 2025 post "Skills vs Dynamic MCP Loadouts" explains why he moved all MCPs (including Playwright and Sentry) to skills. His evaluation criteria are practical rather than formal: the Sentry MCP cost him "around 8k tokens out of the box"; skills load only a short summary and "do not actually load a tool definition into the context"; wrapping MCPs as CLIs via Steinberger's mcporter required hand-maintained skill summaries that broke when the MCP server changed its query syntax. His preferred pattern is "to ask the agent to write its own tools as a skill" because "whenever it breaks or needs some other functionality, I ask the agent to adjust it". In his January 2026 pi post he adds: "My agent has quite a few skills and crucially I throw skills away if I don't need them," and he uses no community skills, only ones "hand-crafted by my clanker". This is vibes plus token accounting, not an eval suite.

### 6. Peter Steinberger: CLIs plus skill docs

Steinberger's approach (OpenClaw's skills are largely CLIs with SKILL.md documentation; mcporter can `generate-cli` from any MCP server) treats the CLI as the tool and the skill as the manual. Reports attribute to him the line "mcp were a mistake. bash is better", but I only found it in secondary blogs; treat it as unverified. I found no primary-source eval methodology from Steinberger for individual skills.

### 7. Mitchell Hashimoto: harness engineering as a failure-driven regression list

Hashimoto's "My AI Adoption Journey" (mitchellh.com, 5 February 2026; quoted here via secondary summaries such as heym.run, as I could not fetch the original) defines harness engineering as: anytime an agent makes a mistake, "engineer a solution such that the agent never makes that mistake again". Mechanisms are AGENTS.md lines (in Ghostty, almost every line corresponds to an observed bad behaviour) and programmed tools such as screenshot scripts and narrowed test runners, which the agent must be told about in AGENTS.md. This is an implicit regression suite: each failure becomes a guard, though not an automated eval.

### 8. Simon Willison, Hamel Husain and Shreya Shankar

- **Willison** called skills "maybe a bigger deal than MCP" (October 2025) because of their low token overhead and portability, and is firmly "team red/green TDD for agent code". His concrete eval contribution is smevals with Vincent; he describes it as his "third iteration" on an eval approach that "feels right". Secondary sources report he later warmed to stateless MCP for auditability (unverified by me).
- **Husain and Shankar** published evals-skills (2 March 2026; now `ai-evals-course/evals-skills`), skills that teach coding agents their product-eval methodology: eval-audit, error-analysis, synthetic data generation, write-judge-prompt and validate-evaluator (calibrating LLM judges against human labels with TPR/TNR). Their methodology, applied to plugins, means: read traces and categorise failures before writing metrics, prefer binary pass/fail over Likert scales, prefer code checks before LLM judges, and validate any judge against human labels. Husain also advises not writing evals for failures you already know how to fix.

### 9. Independent evidence on whether skills help

| Source | Setup | Finding |
|---|---|---|
| Vercel (Jude Gao, 27 Jan 2026) | Hardened Next.js 16 API evals, behaviour-based assertions, retries | Baseline 53%; skill default 53% (never invoked in 56% of cases); skill with explicit AGENTS.md instruction 79%; 8KB AGENTS.md docs index 100% (+47pp over baseline) |
| SkillsBench (arXiv 2602.12670, v4, June 2026) | 87 tasks, 8 domains, deterministic verifiers, 9,396 trajectories across 18 configurations | Curated skills lift pass rate from 33.9% to 50.5% (+16.6pp); earlier version: +4.5pp software engineering, +51.9pp healthcare, 16 of 84 tasks worse, self-generated skills about -1.3pp; focused skills with at most three modules beat exhaustive bundles |
| Anthropic description tuning | Six public document skills | Improved triggering on 5 of 6 |
| Zechner MCP vs CLI | 3 tasks × 4 tools × 10 runs | Success identical; protocol choice mattered less than tool design |

Vercel also found instruction wording was fragile: "You MUST invoke the skill" anchored the agent on docs and missed project context, while "Explore project first, then invoke skill" did better. Its takeaway is to "Build evals targeting APIs not in training data". Note that the software engineering gain in SkillsBench is the smallest of any domain, which supports the minimalists' instinct for coding work.

## How respected engineers decide whether an extension earns its place

| Signal | Who uses it | How measured |
|---|---|---|
| Success rate with versus without | Anthropic, OpenAI, Vincent, Vercel, Zechner | Repeated runs per arm; `Δ` or pass-rate delta |
| Trigger/selection accuracy | Anthropic, OpenAI, Vincent, Vercel | `tool_used: Skill` graders, implicit-invocation cases, naive-prompt trigger tests |
| Token cost and context bloat | Ronacher, Zechner, Anthropic | Tokens at session start (e.g. 8k for Sentry MCP), per-run `total_tokens`, `/cost` |
| Latency | Anthropic, Zechner, Vincent | `duration_ms`, wall-clock per run |
| Variance and flakiness | Anthropic skill-creator, Vincent | Mean ± stddev; "Variance is a metric" |
| Process fidelity | OpenAI, Anthropic, Vincent | Trace checks on commands run and tool order |

**When they delete:** when the no-skill arm matches the with-skill arm (Anthropic's "outgrown" signal), when a skill is unused (Ronacher throws them away; Vercel showed unused skills can add noise), when an MCP's token footprint outweighs its value (Ronacher, Zechner), or when a section's removal does not degrade the eval (Vincent's ablations).

## Where practitioners disagree

- **Minimal harness versus plugin ecosystem.** Zechner and Ronacher want no MCP and no downloaded skills, only agent-written, disposable extensions; Vincent ships a large, opinionated plugin that people install wholesale; Anthropic and OpenAI are building marketplaces. Both camps agree context is the scarce resource.
- **Skills versus always-on context.** Vercel's data favours AGENTS.md for broad framework knowledge; Anthropic's position is that skills suit capability uplift and encoded workflows. A fair reading is that skills win for vertical, action-specific workflows and lose when the bottleneck is triggering.
- **MCP versus CLI.** Zechner's own data says it is "a wash" on success; Ronacher and Steinberger prefer CLIs for composability and control; Anthropic's tool guide is protocol-neutral and evaluation-driven.
- **Vibes versus formal evals.** Ronacher and Steinberger rely on daily use and token accounting; skill-creator itself allows "just vibe with me"; Vincent moved from vibes to subagent pressure tests to formal, pre-registered eval suites; Husain warns against both generic metrics and eval paralysis. The convergent view: vibes are fine for personal, disposable tools; anything shared, published or gated in CI needs a baseline-controlled suite.
- **Who should write the skill.** Ronacher and pi let the agent write skills; SkillsBench found self-generated skills (written before the task, without feedback) did not help. These are compatible: agent-written skills refined from real traces and failures differ from skills generated blind.

## Recommendations: a workflow for building a plugin with evals from scratch

1. **Start from observed failures, not ideas.** Run the agent on 5 to 10 real tasks with no extension; read transcripts and categorise failures (Husain's error analysis). If the base model already succeeds, stop.
2. **Choose the lightest container.** One-line fixes go in AGENTS.md or CLAUDE.md (Hashimoto). Procedures go in a skill. Executable capabilities go in a CLI with a skill as its manual (Steinberger, Ronacher). Use MCP only when there is no shell, you need shared auth or a narrow permission surface. Bundle into a plugin only when you need to ship several together.
3. **Write evals before the skill.** At least three cases that fail at baseline (Anthropic docs), plus negative cases that should *not* trigger. For tools/MCP, write multi-step tasks with single verifiable answers (mcp-builder's 10-question pattern).
4. **Structure the plugin** with `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md` (under 500 lines, references split out, scripts in `scripts/`), and `evals/` with one directory per case; add `evals/results/` to `.gitignore`.
5. **Grade in layers.** Free deterministic graders first (`regex`, `file_exists`, `tool_order`, or OpenAI-style JSONL command checks); one process grader (`tool_used`); then a short, binary LLM rubric only where necessary, validated against a handful of your own labels.
6. **Test triggering separately.** Use natural phrasings that do not name the skill, plus explicit invocations. Write the description as triggering conditions only, not a workflow summary (Vincent), and slightly "pushy" if it undertriggers (Anthropic). Tune with skill-creator's description optimiser.
7. **Iterate cheaply, confirm properly.** Use `--runs 1 --ablation none` for quick loops, then confirm at three or more runs with the baseline arm. Treat variance across repetitions as a signal that wording is not binding. Use a held-out set before declaring victory.
8. **For discipline skills, pressure-test.** Combine three or more pressures (time, sunk cost, authority) in realistic scenarios; capture rationalisations verbatim and add Excuse/Reality rows (Vincent).
9. **Gate CI.** Run `claude plugin eval` with `--trust-plugin`, `--json`, a threshold (e.g. 0.8), pinned agent and judge models, `--no-publish` and a cost ceiling; record replayed MCP mocks for determinism. Keep fast every-commit suites judge-free and run judge-graded suites nightly.
10. **Re-evaluate on every model release and prune.** If `W/OUT` catches up with `WITH`, delete or shrink the skill. Ablate sections to find dead weight. Track tokens and time alongside pass rate so a "helpful" skill that doubles cost is visible.

## Caveats

- Many specifics are recent (2026) and fast-moving: `claude plugin eval` requires a very recent Claude Code version and its docs describe an `experimental` eval directory key; formats may change.
- Several datapoints are self-reported by vendors with an interest in the result (Anthropic's 5 of 6 triggering improvement, Vercel's 100%, Superpowers' speed and token claims). Vercel's eval suite targets one framework, and its skill-versus-AGENTS.md result may not generalise.
- Zechner explicitly calls his benchmark "not a fully scientific evaluation", with three tasks; pi's Terminal-Bench placement was based on a single full run at the time.
- Hashimoto's harness-engineering quotes, Steinberger's "mcp were a mistake" line and Willison's later MCP views reached me via secondary sources. Some Superpowers test-directory details came from release notes and a third-party scan rather than direct inspection.
- I found no primary-source material from Kent Beck or Geoffrey Huntley specifically on evaluating plugins or skills, so they are not represented here.
- Academic follow-ups (e.g. Trace2Skill) report that Anthropic's skill-creator did not improve base skills on average in their SpreadsheetBench setting, a reminder that tooling does not guarantee gains without good tasks.
