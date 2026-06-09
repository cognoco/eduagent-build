# Runbook — Identity-Foundation Phase K+L consolidation

The caller-side procedure for `identity-foundation-k-l-consolidation.js`. The workflow does the
fan-out / classify / verify / size; this runbook covers what the **caller** owns: build the run
inputs, invoke, render the **pre-gate** outputs, then apply the **Gate-1 ruling deterministically**
and render the **finalized** outputs.

> **Landed instance (2026-06-09).** This ran end-to-end: J0 was closed, the full workflow completed,
> Gate 1 + K.6 were ruled, and the finalized artifacts are committed under
> `docs/audit/2026-05-29-full-audit/`. The canonical workflow result is persisted there as
> `_kl-workflow-result.json` — the reproducibility input for Steps 4–5 below (no 22M-token re-run
> needed to regenerate the finalized L/K.5 artifacts). The steps below are written so the pipeline
> is **re-runnable**, not just descriptive of that one run.

## Preconditions

- **J0 closed** — the four identity domain docs have graduated; you know the post-J0 canonical
  surface (a `docs/canon/…` doc or the relevant index) to use as the scope lens.
- `.deepsec/findings/` is present on the checkout (committed on PR #625; `main` does **not** carry
  it). If absent, regenerate: `pnpm deepsec export --format md-dir --out ./findings`. If you proceed
  without it, the DeepSec coverage check is skipped (not blocking) and the run is weaker.

## Step 1 — Build args (pre-step)

```bash
node .claude/workflows/identity-foundation-k-l-render.mjs --build-args > /tmp/kl-args.json
```

This globs `.deepsec/findings/**/*.md` → `deepsecExpectedCount` and emits an args skeleton. **Edit
`/tmp/kl-args.json`:** replace `scopeLensBriefPath`'s placeholder with the post-J0 graduated
canonical surface. Everything else defaults inside the workflow script — override a corpus path only
if J0 moved it.

> Why a script for this: the workflow script has no filesystem access, so the one deterministic
> input it can't compute itself (the DeepSec file count, the load-bearing coverage denominator) is
> supplied here.

## Step 2 — Invoke the workflow

```
Workflow({
  scriptPath: '.claude/workflows/identity-foundation-k-l-consolidation.js',
  args: <contents of /tmp/kl-args.json>
})
```

Optional first: a **one-source subset smoke-run** for runtime proof (pass an `args.sources` with a
single entry) before the full run. Watch progress with `/workflows`.

The Workflow tool returns the structured result to you. Save it verbatim:

```bash
# paste the returned JSON
cat > /tmp/kl-result.json
```

## Step 3 — Render PRE-GATE (deterministic) + the status gate

```bash
node .claude/workflows/identity-foundation-k-l-render.mjs --render /tmp/kl-result.json
# also persist the result as the canonical reproducibility input for Steps 4–5:
#   docs/audit/2026-05-29-full-audit/_kl-workflow-result.json  (the bare result object)
```

The renderer **enforces the gate** — it writes nothing on `blocked_on_gaps` and prints `qaFailures`
+ `finalCritic.gaps` so you can see exactly which lane failed:

| `workflowStatus` | Renderer action |
|---|---|
| `complete` | Writes both files. All completeness mechanisms ran. |
| `complete_without_oracle` | Writes both files **with a banner caveat** — the META-REPORT cross-check didn't run; completeness is single-checked. |
| `blocked_on_gaps` | **Writes nothing**, exits 1. Resolve the gap (re-extract the unrepresented source / fix the dead lane), then re-run the workflow with `resumeFromRunId` (caches the unchanged prefix). |

Outputs (paths come from `result.outputPaths`) — these are **PRE-GATE**: the L delta's `Interim
owner` / `Blk` columns render as `—` until Gate-1 finalize (Step 5):
- `docs/audit/2026-05-29-full-audit/RECONCILED.md` — Phase K (sections A/B/C, QA dashboard, pre-gate K.5, appendices).
- `docs/audit/2026-05-29-full-audit/L-gap-delta.md` — Phase L (one row per finding; `Disposition` = scope_class).

**The render is mechanical by design** — tables come straight from the verified `rows`; no agent
re-types them. The renderer **owns the full column set** for both pre- and post-gate states, so a
re-render never silently drops the Gate-1 fields.

## Step 4 — Gate 1 ruling → the disposition map

Rule the contested rows (the *Contested rows* appendix in `RECONCILED.md`) in/out under the governing
policy (layered, for the landed run). Capture the ruling as a **committed decision record**, NOT a
hand-edit of the tables:

- `docs/audit/2026-05-29-full-audit/gate1-disposition.json` — one entry per ruled finding:
  `{"F-NNN": {"b": bucket, "call": "IN"|"OUT", "ow": interim/target-owner, "blk": "Y"|"N"|"-", "n": basis}}`.

A ruling can dissolve a contradiction limb (changes K.5). **Do not edit the L table by hand** — Step 5
applies the map deterministically and the renderer re-emits the table.

## Step 5 — Deterministic Gate-1 finalize + K.5/K.6 (K's exit gate)

```bash
node .claude/workflows/identity-foundation-gate1-finalize.mjs \
  docs/audit/2026-05-29-full-audit/_kl-workflow-result.json \
  docs/audit/2026-05-29-full-audit/gate1-disposition.json \
  /tmp/kl-finalized.json
node .claude/workflows/identity-foundation-k-l-render.mjs --render-l /tmp/kl-finalized.json
```

`gate1-finalize.mjs` applies the disposition map (no scope judgement of its own — that lives in the
JSON), writes the finalized result JSON, and emits:
- `gate1-closure.md` — the Gate-1 decision record + the execution-blocking (N.0) patch-now list.
- `gate1-k5-postgate.md` — the **post-gate K.5 reconciliation sizing** (contradictions resolved /
  IF-slice effort / canon dependency / readiness — the cost/value input to K.6).

`--render-l` then re-emits the **finalized** `L-gap-delta.md` (renderer-owned; `Disposition` /
`Interim owner` / `Blk` all populated). `--render-l` writes **only** the L delta, so the hand-authored
K.6 ruling in `RECONCILED.md` is not regenerated.

Finally, the **human exit gate**: fold the post-gate K.5 into `RECONCILED.md`, then rule
**K.6 — reconcile-now-vs-defer** (now / defer-to-rewrite / route-out / defer-entirely) and record it
in `RECONCILED.md` § Human gates. That closes Phase K; the finalized `L-gap-delta.md` flows into
M (four-bucket triage, seeded by the `Disposition` column) → N → O.

## Notes

- Re-running: stop the prior run (`TaskStop`) before `Workflow({ scriptPath, resumeFromRunId })`.
- Re-rendering finalized artifacts does **not** need a workflow re-run: Steps 4–5 consume the
  persisted `_kl-workflow-result.json` + `gate1-disposition.json` (both committed), so the chain is
  reproducible from tracked inputs alone.
- The `claude/` + `codex/` trial reconciliations are **discarded** — provenance-mention only, never
  an input. `workflow-3` (inventory) + `workflow-4` (recommendations) are **meta-outputs**, excluded
  from finding rows (they inform M/N/O's workstream discovery, surfaced as advisory hints only).
