# Mechanism productionization — design input (grill seed)

**Status:** DESIGN INPUT · persists decisions ruled 2026-06-13 · seeds the combined
design/grill for **PRG-04** (top-down delivery layer) + **PRG-05** (execution/loop
mechanism). Not a design doc — the design is the grill's output.
**Owner:** Jorn (rulings) + Hex (synthesis).
**Home rule:** this doc is the *home* for the decisions below; the roster carries
only the PRG-04/PRG-05 rows + queue/gate pointers (one fact, one home).

## What this is

The program-delivery mechanism we hand-built and dogfooded across four Initiatives
(IF, L10n, errors-api, security-pii) is mature enough (N≥3, planning-reference §7.4)
to productionize. It splits into **two related-but-distinct Initiatives**, designed
together because they share their seams:

- **Half A — PRG-04 · top-down delivery layer.** The Program → Initiative(≈Epic) →
  Workstream layer Cosmo structurally lacks. *Net-new.* Home of the rules:
  `planning-reference.md`; proto-epic schema: the roster.
- **Half B — PRG-05 · execution/loop mechanism.** The shepherd ↔ executor ↔
  reviewer loop: shepherd-kickoff, executor-protocol/pointer-brief, the autonomous
  reviewer-dispatcher, the cross-runtime seam contracts. *Enhancement* riding on
  ZDX's existing bottom-up `/cosmo:*` lifecycle — several of its findings are
  bug/enhancement WIs against `zdx-core`/`cosmo`, not new structure.

## Inputs (read before the grill)

- **Loop dogfood corpus** (`_wip/identity-foundation/`): `review-loop-mechanics.md`,
  `review-loop-observations.md` (shepherd side), `review-loop-reviewer-observations.md`
  (reviewer side), `review-loop-productization-handoff.md` (8 named gaps + target
  "dispatcher service"), `executor-protocol.md`, `executor-protocol-example.md`
  (verbatim WI-578 pointer-brief), `new-llm-review-watcher-kickoff-prompt.md`, and
  the live `review-watcher-v3.ts`.
- **Rules:** `planning-reference.md` (canonical v1.1) — §2.5–2.7 session model + model
  tiering; declares itself the PRG-04 embryo.
- **Cosmo capture point:** `WI-590` (currently double-loaded — top-down + loop input;
  the loop half re-homes to PRG-05 at slice).

## Locked decisions (2026-06-13)

1. **Two sibling Initiatives, one combined design/grill** before either is sliced.
   Their shared surface is the *seams*; designing them apart would hard-code
   conflicting seam assumptions.
2. **Sequence: spike → grill → slice.** No Cosmo objects until post-grill. Slicing
   first would pre-commit structure the grill exists to harden.
3. **Agnosticity scope — runtime-swap unit = the role.** Three swappable role-units:
   **orchestrator · shepherd-with-its-executors · reviewer**. Agnostic *contracts*
   live only at the two already-artifact-mediated boundaries — **orchestrator↔shepherd**
   and **shepherd↔reviewer** (plus executor↔repo-gates, external anyway). The
   **shepherd↔executor seam is native-by-design**: a Claude shepherd drives Claude
   sub-agents, a Codex shepherd drives Codex executors — never cross-runtime, never
   "Codex driving Claude sub-agents." **Reviewer-runtime ≠ executor-runtime is a
   quality invariant** (independent runtimes catch disjoint defects — the loop's own
   evidence), binding to the *executor runtime actually used per WI*, not the
   shepherd runtime. Productize *contract* neutrality at the two boundaries (cheap);
   do **not** build the full role cross-product (speculative configurability).
4. **The agnosticity spike (Claude-only, additive, pre-grill).** One throwaway WI.
   Two cross-model probes, both via the Codex plugin's `codex-companion` runtime
   (NOT `codex:codex-rescue`, which is a forwarder forbidden from orchestrating):
   - **(a)** Claude shepherd choosing per-executor between a Claude sub-agent and a
     **Codex-model executor** — does it buy quality / cost / throughput?
   - **(b)** A Claude executor spawning a **Codex nested adversarial reviewer** for
     its phase-4 review (nested sub-agents). This seam is already artifact-mediated,
     throwaway, read-only — the lowest-risk, highest-signal probe.
   - **Watch-item:** when (a) picks a Codex executor, flip that WI's reviewer to
     Claude to preserve reviewer≠executor independence (decision 3).
   Output: a one-page finding that is a **required input to the grill** — the grill
   must not design the executor-backend question on assumption.

## Non-goals

- Not slicing into Cosmo now (post-grill).
- Not externalizing the shepherd↔executor seam (native-by-design — decision 3).
- Not the full 2⁴ role-assignment cross-product — only the executor-backend choice
  and the reviewer-independence invariant earn productizing.

## Grill spine — the seam catalogue

The grill's organizing frame: enumerate every cross-role and cross-altitude seam,
classify each **artifact-mediated** (agnostic) vs **in-process** (not), rule the
target contract. Reject any contract that leaks a runtime-specific affordance
(Claude's SendMessage, Codex's session model) — prior art for that tax already
exists (`.claude/skills` generated from `.agents/skills` because the two runtimes
discover skills differently). Starting classification:

| Seam | Coupling today | Target |
|---|---|---|
| orchestrator ↔ shepherd | boundary events in roster/tracker + Cosmo | artifact contract (agnostic) |
| shepherd ↔ executor | Agent tool + SendMessage (Claude) / native (Codex) | **native-by-design — do not neutralize** |
| shepherd ↔ reviewer | Cosmo Stage + page comments (watcher polls) | artifact contract (already cross-runtime) |
| executor ↔ repo gates | git / GitHub / CI / PR | external (already agnostic) |

## Open questions for the grill (consolidated from both observations files + the handoff)

- **Transport/infra:** event channel vs polling; one authoritative watcher with a
  lease (no accidental multi-watcher); durable de-dupe state across restart; bounded
  concurrency/backpressure; the **runner-adapter** contract *per role*
  (`codex exec` / `codex-companion` / API / Archon / queue).
- **Contracts/data:** structured review-result envelope (JSON); structured override
  policy (`{wi_id, rule_id, reason, approved_by, expires_at, scope}`); per-workstream
  policy (`{base_branch, landing_ref, allowed_dod_overrides, approval_reason, scope}`);
  bounce contract (Stage + claim-release + findings location + notify
  claimant-of-record); a **published close-evidence contract** (field-by-field, not
  oral tradition reconstructed from bounces).
- **Loop semantics:** fold children/provenance sweep **into** `/cosmo:execute complete`
  (single idempotent close path); **per-risk-class DoD depth** (the #1 tuning knob);
  merge-gate placement per risk class (pre-review vs review-gated); a flake /
  unrelated-failure lane; a first-class **blocked-on-human** lane; mechanize the cheap
  executor checks (green-on-HEAD, no `_plan-*` in diff, CWD assertion, verdict parse).
- **Agent boundaries:** role isolation / context inheritance (review workers must not
  become supervisors); executor briefs generated from a **living checklist that
  auto-accretes** each review-gate lesson (today the shepherd retypes amendments).
- **Agnosticity:** the seam catalogue above + the spike findings; reviewer≠executor
  enforcement mechanism.

## Roster delta applied (2026-06-13)

PRG-04 narrowed to top-down-only; **PRG-05 added** (this Initiative); activation-queue
row 9 now covers both behind the spike→grill→slice gate; change-log entry recorded.
Cosmo `WI-590` split deferred to slice time (no Cosmo mutation pre-grill).

## Spike status

- **2026-06-13 — PRG-05 DESIGN-PHASE ACTIVE; spike scoped, not yet run.** Decision to
  run the spike taken; PRG-05 moved embryo → active (design phase) on the roster.
  Spike is pre-Cosmo (design activity, tracked here — no Cosmo WI; slicing is
  post-grill). Next: scope the throwaway WI + decide run venue (this session vs
  dedicated). Deliverable: one-page finding → required input to the grill.
