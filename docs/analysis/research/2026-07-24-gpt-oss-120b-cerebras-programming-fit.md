# GPT-OSS-120B on Cerebras: programming fit

**Date:** 2026-07-24
**Question:** Is the GPT-OSS model that MentoMate serves through Cerebras useful for programming?
**Scope:** Current first-party model/provider documentation, the OpenAI model card, primary benchmark sources, and the current MentoMate routing code. No live model run was performed for this note.

## Bottom line

**Yes, `gpt-oss-120b` at high reasoning is useful for programming—but as a very fast, inexpensive mid-tier coding model, not as the default authority for difficult or unattended repository work.**

It has credible code generation and repository-repair ability: OpenAI reports **62.4% on SWE-bench Verified**, **44.4% on Aider Polyglot**, and a **2622 Codeforces Elo with a terminal tool** at high reasoning. Those results are materially useful, especially for bounded tasks with tests. They are also 2025-era results, below later purpose-built coding models, and the SWE-bench number now carries a contamination warning from OpenAI itself.

For MentoMate specifically:

- The production model is the stronger **120B variant**, at **high reasoning**, so the applicable evidence is the best GPT-OSS column rather than the 20B or low-reasoning results.
- Cerebras makes the model attractive for interactive developer assistance because it offers a 131,072-token context, structured outputs, tool calling, and very high generation speed.
- The **current MentoMate adapter does not expose tools, developer/tool message roles, or tool-call responses**, even though the Cerebras API supports them. It therefore cannot currently act as a real coding agent through the existing `LLMProvider` abstraction.
- The best near-term role is scoped code explanation, test generation, small patch drafting, log/diff analysis, and first-pass review, with deterministic tests and human/frontier-model review. It should not replace Codex/Claude-class models for complex cross-package changes, security/auth/data-access work, migrations, or autonomous commits and merges without a repo-specific evaluation.

## 1. The exact model and role in this repository

This research is about **`gpt-oss-120b` served directly by Cerebras with `reasoningEffort: 'high'`**, not GPT-OSS-20B:

- The model register makes it the active universal primary for interactive text and the shared model for async deep jobs: [`docs/registers/llm-models/master.md`](../../registers/llm-models/master.md), especially lines 39 and 47.
- The router hard-codes `CEREBRAS_DEFAULT_MODEL = 'gpt-oss-120b'` and returns it with high reasoning and an 8,192-token completion ceiling: [`apps/api/src/services/llm/router.ts`](../../../apps/api/src/services/llm/router.ts), lines 443, 653, and 918–924.
- The current adapter sends OpenAI-compatible chat completions to Cerebras and passes `reasoning_effort` at the top level: [`apps/api/src/services/llm/providers/cerebras.ts`](../../../apps/api/src/services/llm/providers/cerebras.ts), lines 51 and 81–98.

That distinction matters because OpenAI's coding results improve substantially with reasoning effort. On GPT-OSS-120B, SWE-bench Verified rises from 47.9% at low reasoning to 62.4% at high, and Aider Polyglot rises from 24.0% to 44.4%. MentoMate is already configured at the strongest evaluated setting.

## 2. Benchmark coding skill

### OpenAI's release evaluation

OpenAI's model card reports the following GPT-OSS-120B results at high reasoning:

| Evaluation | Result | What it tests | Interpretation |
|---|---:|---|---|
| SWE-bench Verified | 62.4% | Repairing real GitHub issues in repositories | Genuine repository-patch ability, but not dependable enough to accept patches without tests/review |
| Aider Polyglot | 44.4% | Editing code across languages using a patch-oriented harness | Useful editing ability, with a large failure tail |
| Codeforces, no tools | 2463 Elo | Competitive programming | Strong algorithmic coding |
| Codeforces, terminal tool | 2622 Elo | Competitive programming with execution feedback | Tool access improves the result materially |
| Tau-bench Retail | 67.8% | Multi-step function/tool use | Useful but far from failure-free agent behavior |
| Tau-bench Airline | 49.2% | Harder multi-step function/tool use | Reliability degrades sharply by task/domain |

Source: [OpenAI GPT-OSS model card, Table 3](https://cdn.openai.com/pdf/419b6906-9da6-406c-a19d-1bb078ac7637/oai_gpt-oss_model_card.pdf), pp. 6–10. OpenAI states that the coding evaluations use high reasoning and that the terminal resembles a Codex CLI `exec` tool.

The practical reading is:

1. **It can program.** A 62.4% repository-repair score is well beyond autocomplete or toy-snippet capability.
2. **Execution tools matter.** The Codeforces improvement with terminal access supports running the model inside a test/compile loop rather than asking for one-shot patches.
3. **It is not highly reliable unattended.** Even the release evaluation leaves roughly 38% of SWE-bench Verified issues unresolved, and Tau-bench shows substantial tool-workflow failures.

### Independent Aider harness result

Aider's own Polyglot leaderboard tested `gpt-oss-120b` at high reasoning through OpenRouter and reported:

- **41.8%** pass rate after the benchmark's two attempts;
- only **79.1% well-formed** responses;
- **77 malformed responses** affecting 47 of 225 cases.

Source: [Aider LLM leaderboard — GPT-OSS-120B high run](https://aider.chat/docs/leaderboards/), run dated 2025-08-06.

This is directionally consistent with OpenAI's 44.4% Aider result, while surfacing an important reliability concern around edit-format adherence. It is not a clean Cerebras-specific measurement—the host was OpenRouter, and provider prompt/rendering choices can affect GPT-OSS—so it should not be treated as proof that the Cerebras endpoint has the same malformed-output rate. It is evidence that a coding harness must validate patches and retry malformed outputs.

### Benchmark caution

OpenAI no longer considers SWE-bench Verified a good frontier comparison. Its 2026 audit found material contamination risk from public benchmark data and scoring weaknesses, and recommends SWE-bench Pro instead. Source: [OpenAI, “Why SWE-bench Verified no longer measures frontier coding capabilities”](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/).

Therefore:

- 62.4% is valid evidence about the release evaluation OpenAI ran;
- it should **not** be interpreted as a clean current ranking against 2026 coding models;
- a MentoMate decision should depend more on a private, repository-specific patch set than on this public number.

## 3. Agent and tool-use reliability

The base model was explicitly post-trained for agentic tools. OpenAI describes browser, Python, arbitrary developer functions, interleaved reasoning/tool calls, and a terminal-like coding evaluation. It also says correct Harmony formatting is critical to best performance. Sources: [OpenAI GPT-OSS model card](https://cdn.openai.com/pdf/419b6906-9da6-406c-a19d-1bb078ac7637/oai_gpt-oss_model_card.pdf), §§2.5–2.6; [OpenAI GPT-OSS repository](https://github.com/openai/gpt-oss).

Cerebras currently advertises the relevant endpoint features:

- function/tool calling;
- multi-turn tool calling;
- `tool_choice`;
- structured outputs and JSON mode;
- reasoning control;
- no parallel tool calls for `gpt-oss-120b`.

Sources: [Cerebras public model metadata](https://inference-docs.cerebras.ai/api-reference/models/public-models) and [Cerebras tool-calling documentation](https://inference-docs.cerebras.ai/capabilities/tool-use).

That makes the endpoint technically suitable for a sequential coding loop:

```text
inspect files → propose edit → apply patch → run focused test → inspect failure → revise
```

It does **not** establish end-to-end coding-agent reliability. The model card's tool benchmark tops out at 67.8% on Tau-bench Retail and falls to 49.2% on Airline. Parallel tool calls are not supported, and Cerebras API v2—now the default as of 2026-07-21—strictly validates tool-call message sequences. A client must preserve every tool-call ID and immediately provide matching tool responses. Source: [Cerebras API version 2 documentation](https://inference-docs.cerebras.ai/api-reference/versions).

### Current MentoMate integration gap

The repository's current abstraction only allows `system`, `user`, and `assistant` messages. The Cerebras request body has no `tools`, `tool_choice`, or tool-call message/result types:

- [`apps/api/src/services/llm/types.ts`](../../../apps/api/src/services/llm/types.ts), lines 58–69;
- [`apps/api/src/services/llm/providers/cerebras.ts`](../../../apps/api/src/services/llm/providers/cerebras.ts), lines 59–72 and 81–98.

So the existing production adapter can generate or review code included in prompts, but it cannot inspect a repository, apply a patch, or run a test by itself. A programming pilot should use a separate coding client/harness or deliberately extend the abstraction; it should not overload the tutor adapter casually.

## 4. Context and serving constraints

Current Cerebras model metadata reports:

| Property | Current value |
|---|---:|
| Context | 131,072 tokens |
| Maximum completion | 40,960 tokens |
| Input price | $0.35 / million tokens |
| Output price | $0.75 / million tokens |
| Streaming | Yes |
| Structured outputs / JSON mode | Yes |
| Function/tools | Yes |
| Parallel tool calls | No |
| Vision | No |
| Quantization | FP16/8, weights only |

Source: [Cerebras public model metadata](https://inference-docs.cerebras.ai/api-reference/models/public-models). This live metadata supersedes the lower launch prices in Cerebras's 2025 launch post.

Cerebras claims up to **3,000 generated tokens/second** for GPT-OSS-120B. That is a provider claim rather than an SLA, but it is the endpoint's main practical advantage: high-reasoning traces and iterative edit/test cycles can return with unusually low generation latency. Source: [Cerebras launch announcement](https://www.cerebras.ai/blog/cerebras-launches-openai-s-gpt-oss-120b-at-a-blistering-3-000-tokens-sec).

Constraints that matter for programming:

- **131K is large, not whole-monorepo memory.** MentoMate's mobile/API/shared-package surface still requires retrieval and deliberate file selection. Dumping the repository into a prompt is neither possible nor desirable.
- **Text only.** It cannot directly inspect screenshots, design mocks, or rendered mobile UI through this endpoint.
- **Sequential tools only.** An agent can still work effectively, but its harness cannot assume parallel calls.
- **Reasoning consumes output budget.** OpenAI finds smooth accuracy gains from higher reasoning with much longer reasoning traces; speed helps, but cost/context accounting must include those tokens.
- **Prompt formatting matters.** OpenAI says Harmony formatting is critical. Cerebras handles its hosted wire format, but alternate proxies or home-grown clients should not be assumed equivalent without testing.
- **MentoMate's production ceiling is lower.** The current router caps completions at 8,192 tokens, appropriate for tutor replies but potentially restrictive for long coding-agent trajectories.

## 5. Recommended role in this codebase

### Good fit now

Use GPT-OSS-120B as a low-latency assistant for bounded, verifiable work:

- explain a selected TypeScript/React Native/Hono/Drizzle file or call path;
- draft focused unit tests from an explicit contract;
- propose a small implementation after the relevant files are retrieved;
- analyze compiler, lint, Jest, or CI output;
- summarize a diff and flag likely regressions;
- generate repetitive but reviewable code or fixtures;
- provide a second opinion during review.

The fast endpoint is especially valuable when the workflow asks for several short revisions and runs tests between them.

### Fit only behind a guarded agent loop

Pilot it for small bug fixes or refactors only when the harness:

1. supplies the repository instructions and a small retrieved context;
2. exposes read/search/apply-patch/test tools;
3. validates every tool call and patch shape;
4. runs focused tests plus the relevant static checks;
5. rejects unrelated file changes;
6. requires human or stronger-model review before commit.

### Poor default fit

Do not make it the sole authority for:

- wide cross-package refactors;
- authentication, authorization, privacy, safety, or payment changes;
- database migrations and concurrency-sensitive writes;
- architectural decisions with incomplete context;
- UI work that requires visual judgment;
- autonomous commits, pushes, merges, or deployments.

This is not because GPT-OSS cannot contribute to those tasks. It is because the available evidence shows a significant long tail of repository-repair, edit-format, and multi-step tool failures, while these surfaces have a high cost of a plausible-but-wrong patch.

## 6. Suggested MentoMate pilot

Before adopting it as a developer model, run a private comparison on **25–50 historical MentoMate tasks** whose fixes and tests are known. Keep `gpt-oss-120b`, Cerebras, and high reasoning exactly pinned.

Measure:

- task success after running the real tests;
- first-pass compile/typecheck rate;
- unrelated-change rate;
- tool-call/schema validity and retries;
- reviewer acceptance and severity of missed defects;
- end-to-end time, not just generation tokens/second;
- total prompt, reasoning, completion, and retry cost.

Include separate buckets for:

- small isolated TypeScript fixes;
- test authoring;
- multi-file feature work;
- hidden-runtime-assumption bugs;
- security/data-access work.

Recommended adoption rule: use it broadly for assistance if it materially improves time-to-green on the first three low-risk buckets; allow autonomous patching only in buckets where the private success rate and defect severity meet a predeclared threshold. Keep a frontier coding model as the escalation path.

## 7. Cost versus ChatGPT Pro and stronger Cerebras coding models

### Raw inference cost

Cerebras's current public metadata prices GPT-OSS-120B at **$0.35/M input
tokens and $0.75/M output tokens**. At those rates, $200 buys:

- about **571M input-only tokens**;
- about **267M output-only tokens**; or
- about **465M total tokens** at an illustrative 80% input / 20% output mix.

Reasoning tokens count toward completion usage, and Cerebras prompt caching
currently improves latency but **does not discount cached-token billing**.
Sources: [Cerebras public model metadata](https://inference-docs.cerebras.ai/api-reference/models/public-models)
and [Cerebras prompt caching](https://inference-docs.cerebras.ai/capabilities/prompt-caching).

That is dramatically cheaper than $200 in raw model tokens. It is not an
apples-to-apples substitute for ChatGPT Pro: Pro includes the Codex agent
harness, repository/tool integration, frontier-model access, and a usage
allowance rather than selling raw GPT-OSS tokens. OpenAI's current $200 Pro tier
is its highest-usage tier, with 20x the standard Plus allowance; additional
Codex use can draw from purchased credits after the included allowance.
Sources: [OpenAI Pro tiers](https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro)
and [OpenAI Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card).

The economic question is therefore **cost per accepted, verified task**, not
cost per token. GPT-OSS remains cheaper when tests and review catch its failures
quickly. A more expensive frontier agent can be cheaper overall on hard work if
it avoids retries, false fixes, and human cleanup.

### Which Cerebras models are credible coding candidates?

As of 2026-07-24, Cerebras's own selection guide does **not** recommend
GPT-OSS-120B for its top "code generation & reasoning" or "code completion &
bug fixing" rows. It lists GPT-OSS for terminal tasks, tool-using agents, and
roughly Haiku / GPT-mini-class substitutions. For Opus-class multi-file
refactors and long agentic loops it points to **Kimi K2.6** and **GLM 5.1**;
**MiniMax M2.5** is another coding-agent candidate. Source:
[Cerebras model-selection guide](https://inference-docs.cerebras.ai/models/choose-a-model).

| Cerebras option | Availability / price | Coding evidence | Current verdict |
|---|---|---|---|
| **GPT-OSS-120B** | Public production endpoint; $0.35/M in, $0.75/M out | 62.4 SWE-bench Verified; 44.4 Aider Polyglot at high reasoning | Excellent value for bounded work; not Sol/Opus class |
| **GLM 4.7** | Public **preview**; $2.25/M in, $2.75/M out; scheduled for deprecation 2026-08-17 | Z.ai reports 73.8 SWE-bench Verified and 41.0 Terminal-Bench 2.0 | Stronger public coding trial than GPT-OSS, but a poor durable dependency |
| **MiniMax M2.5** | Cerebras dedicated endpoint; custom price | MiniMax reports 80.2 SWE-bench Verified and parity with Opus 4.6 on selected harnesses | Serious pilot candidate, but the headline uses the now-saturated Verified benchmark and is vendor-reported |
| **Kimi K2.6** | Cerebras dedicated endpoint; custom price | Moonshot reports 58.6 SWE-bench Pro and 66.7 Terminal-Bench 2.0, around or above GPT-5.4 / Opus 4.6 in its setup | Strongest documented Cerebras shortlist candidate for agentic coding |
| **GLM 5.1** | Cerebras dedicated endpoint; custom price | Z.ai reports 58.4 SWE-bench Pro and 62.0 Terminal-Bench 2.1; designed for long tool loops | Worth a pilot, but already materially behind newer GLM 5.2 and current frontier results |

Primary benchmark sources:
[GLM 4.7](https://docs.z.ai/guides/llm/glm-4.7),
[MiniMax M2.5](https://www.minimax.io/news/minimax-m25),
[Kimi K2.6](https://www.kimi.com/blog/kimi-k2-6), and
[GLM 5.1](https://github.com/zai-org/GLM-5).
Cerebras's [current model catalog](https://inference-docs.cerebras.ai/models/overview)
supplies the public/preview status and GLM 4.7 deprecation date.

### Can any of them match current Sol or Opus?

**No Cerebras-hosted model has enough comparable evidence to claim parity with
current GPT-5.6 Sol or current Claude Opus end-to-end.** The strongest Cerebras
claims mostly compare against older GPT-5.4 / Opus 4.6 releases, use
vendor-selected harnesses, or use SWE-bench Verified rather than the harder
current evaluations.

OpenAI reports GPT-5.6 Sol at **80** on the Artificial Analysis Coding Agent
Index, **88.8%** on Terminal-Bench 2.1, **72.7%** on DeepSWE v1.1, and **64.6%**
on SWE-bench Pro. The same published comparison reports Claude Opus 4.8 at
72.5, 78.9%, 59.0%, and 69.2%, respectively. These numbers are not directly
comparable to every vendor table, but they show why older Verified scores do
not establish current parity. Source:
[OpenAI GPT-5.6 launch evaluations](https://openai.com/index/gpt-5-6/).

The strongest honest conclusion is:

- **public Cerebras:** no Sol/Opus match;
- **dedicated Cerebras:** Kimi K2.6 and GLM 5.1 deserve a private bake-off, but
  parity is unproven and pricing requires a Cerebras quote;
- **functional gap:** Cerebras currently serves even natively multimodal
  dedicated models as text-only, so the route also cannot replace frontier
  visual UI-debugging workflows. Source:
  [Cerebras dedicated endpoints](https://inference-docs.cerebras.ai/dedicated/overview).

## Conclusion

GPT-OSS-120B on Cerebras is **useful enough to merit a programming pilot and likely valuable as a fast code assistant**. Its programming ability is real, its high-reasoning configuration is the correct one, and Cerebras's speed changes the feel of iterative tool loops.

It is **not strong evidence for replacing a frontier coding agent**. The public coding numbers are respectable but dated, SWE-bench Verified is now compromised as a frontier yardstick, independent Aider results show format failures, and MentoMate's current adapter does not expose agent tools at all. The sensible posture is **assistant first, guarded bounded agent second, autonomous high-risk engineer no**—until a private MentoMate benchmark demonstrates otherwise.

## Primary sources

- [OpenAI: Introducing GPT-OSS](https://openai.com/index/introducing-gpt-oss/)
- [OpenAI: GPT-OSS-120B and GPT-OSS-20B model card](https://cdn.openai.com/pdf/419b6906-9da6-406c-a19d-1bb078ac7637/oai_gpt-oss_model_card.pdf)
- [OpenAI: GPT-OSS source repository and reference clients](https://github.com/openai/gpt-oss)
- [OpenAI: Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
- [Cerebras: current public model metadata](https://inference-docs.cerebras.ai/api-reference/models/public-models)
- [Cerebras: tool calling](https://inference-docs.cerebras.ai/capabilities/tool-use)
- [Cerebras: API version 2](https://inference-docs.cerebras.ai/api-reference/versions)
- [Cerebras: GPT-OSS-120B launch performance](https://www.cerebras.ai/blog/cerebras-launches-openai-s-gpt-oss-120b-at-a-blistering-3-000-tokens-sec)
- [Aider: LLM Polyglot leaderboard and GPT-OSS-120B run metadata](https://aider.chat/docs/leaderboards/)
- [Cerebras: model-selection guide](https://inference-docs.cerebras.ai/models/choose-a-model)
- [OpenAI: GPT-5.6 launch evaluations](https://openai.com/index/gpt-5-6/)
- [Moonshot AI: Kimi K2.6 coding results](https://www.kimi.com/blog/kimi-k2-6)
- [Z.ai: GLM 5.1](https://github.com/zai-org/GLM-5)
- [MiniMax: M2.5 coding results](https://www.minimax.io/news/minimax-m25)
