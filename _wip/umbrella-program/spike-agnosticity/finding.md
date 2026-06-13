# Agnosticity spike — finding

**Spike:** methodology spike under **PRG-05** (execution-mechanism productionization), design phase.
**Question:** can the estate dispatch agent work across runtimes (Claude ⇄ Codex), including *nested* cross-runtime adversarial review, and what does the seam contract have to guarantee?
**Fixture:** `WI-697` — throwaway `clamp(n,lo,hi)` + colocated test; a vehicle only. The deliverable is this meta-finding.
**Runs:** Run 1 banked probes a-i / a-ii then was killed by a subscription wall (not a structural depth limit). Run 2 (this finding) completed probe (b) + the watch-item.

---

## Per-probe verdicts

### (a-i) Claude executor — **SUCCESS** (banked run 1; re-confirmed run 2)
A Claude sub-agent (Agent tool, sonnet, depth-1) pinned to a throwaway worktree built `scratch/clamp.ts` + `scratch/clamp.test.ts` cleanly, fully isolated. Run 2's Claude executor independently chose to **throw `RangeError` on `lo>hi`** and **included a NaN test** — a *different* spec reading than run-1's Codex executor (see watch-item). The executor has no native Cosmo awareness; lifecycle is orchestrator-driven.

### (a-ii) Codex executor — **SUCCESS** (banked run 1)
`codex exec --cd <worktree> -s workspace-write` built the fixture in 56s / ~57k tok, fully isolated (root never touched). Quality: normalizes `lo>hi` via `Math.min/Math.max` (silent correction, not rejection); **no NaN test**. The isolation requirement is load-bearing — see seam contract.

### (b) Nested cross-runtime adversarial review — **BOTH PATHS SUCCESS** (run 2)
Claude executor (depth-1) → Codex reviewer (depth-2), two mechanisms:
- **Path (i) — true nested sub-agent** (`Agent` tool, `subagent_type: codex:codex-rescue`): **WORKED mechanically.** Returned ~12 genuine Codex-generated adversarial findings in ~97s, no error/timeout. This was run 1's *blocker* — and run 1's wall was a **subscription-access expiry, not a nesting-depth limit**; with that resolved, nested cross-runtime dispatch is functional. Caveat: `codex:codex-rescue` is a **task-only forwarder** — it cannot invoke a structured adversarial-review command; it forwards the "review this diff" prompt as a plain task. Adequate for "does nesting work"; not a substitute for a real review harness.
- **Path (ii) — direct CLI** (`codex exec --cd <wt> -s read-only "<review prompt>"`): ran clean, exit 0, gpt-5.5 high-reasoning, ~36k tok / ~30s, auto-loaded the repo's `deep-bugfixing` skill, returned 3 concise actionable findings. **This is the production review mechanism.**

### Watch-item — reviewer-runtime ≠ executor-runtime → **independence HELD and PAID OFF**
Executor = Claude, reviewer = Codex. The Codex reviewers caught issues a Claude self-review plausibly misses because the author's intent-knowledge hides them: the `-0` `Object.is`-vs-`.toBe` identity gap, `undefined as any` TS-boundary trust, **NaN-vs-`lo>hi` guard precedence**, and the missing `lo===hi` single-point case. Both paths also independently flagged a "degenerate interval" terminology error. The two runtimes *also diverged on the spec itself* (Claude throws on `lo>hi` + tests NaN; Codex normalizes + skips NaN) — direct evidence that the ambiguous requirement is genuinely runtime-dependent, exactly the class of divergence cross-runtime independence is meant to surface. **Cross-runtime review independence is real, not theoretical.**

---

## Seam-contract implications (for the runner-adapter / nested-review contract the grill must design)

1. **Write-capable Codex executors MUST force cwd into the throwaway worktree.** The shared `codex-companion` runtime is **root-pinned + filesystem-read-only by default**; a naive `codex-companion task --write` adapter would write to the *shared root checkout* (irreversible pollution of live sessions). The sanctioned primitive is **`codex exec --cd <worktree> -s workspace-write`**. Never `--write` at root. (Banked run 1; the single hardest isolation requirement.)

2. **Read-only reviewers use `-s read-only`.** `codex exec --cd <wt> -s read-only "<prompt>"` is the production adversarial-review seam — it auto-discovers repo skills (`deep-bugfixing`) and needs no inline file paste.

3. **Nested sub-agent dispatch works but the wrapper is a task-only forwarder.** `subagent_type: codex:codex-rescue` mechanically dispatches a depth-2 Codex agent, but cannot call a structured review command — it forwards prose prompts as tasks. For *quality* review, the contract should prefer the **direct `codex exec` CLI** (path ii); reserve the Agent-wrapper path for cases that genuinely need the harness's sub-agent plumbing.

4. **Sub-agent reviewers can't read the worktree by default → context must be handed over.** Path (i) required pasting file contents inline (token cost + truncation risk at scale). A robust nested-review contract either (a) uses `codex exec --cd` so the reviewer reads files itself, or (b) defines an explicit diff/file-payload handoff — it must not assume the nested agent shares the executor's filesystem view.

5. **Cosmo lifecycle is orchestrator-owned, runtime-agnostically.** Neither runtime has native Cosmo awareness; the lifecycle writer is a plain `bun` CLI driven via `NOTION_TOKEN`. "Can runtime X operate Cosmo" reduces to "can it shell out to bun." The adapter must **never delegate `claim`/`complete` to a Codex (or any executor) sub-agent** — the orchestrating runtime owns the lifecycle. (Banked run 1.)

6. **Adapter input hygiene.** `codex-companion task` does **no arg validation** — everything after `task` becomes prompt text (a stray `--help` launched a real task). The runner-adapter must never pass through stray flags as prompt.

7. **Output-parsing robustness.** `codex exec` can emit the findings block twice (stdout flush quirk) and auto-run greps that bleed unrelated repo hits into context. A result-handling contract must tolerate duplicate blocks and irrelevant tool-output noise (a weaker reviewer model could be derailed by the latter).

---

## Recommendation

**Cross-runtime dispatch is production-viable now, including nested adversarial review.** Adopt **direct `codex exec --cd <worktree>`** as the canonical Codex seam for *both* execution (`-s workspace-write`) and nested review (`-s read-only`), in preference to the shared `codex-companion` runtime (root-pinned) and the `codex:codex-rescue` Agent-wrapper (task-only forwarder, no worktree visibility). Keep all execution inside throwaway worktrees with orchestrator-owned Cosmo lifecycle. The runner-adapter contract the grill designs should encode points 1–7 above; the highest-value, hardest-to-get-right requirement is **#1 (forced-cwd write isolation)**. Cross-runtime reviewer independence delivers genuinely additive findings and a spec-divergence signal — **make reviewer-runtime ≠ executor-runtime a contract default, not an option.**

The remaining run-1 confounds (shepherd launched as a sub-agent, so depths were +1 vs real ops; the subscription wall) are resolved or irrelevant: nesting works at the depths tested, and the wall was an entitlement state, not an architectural limit.
