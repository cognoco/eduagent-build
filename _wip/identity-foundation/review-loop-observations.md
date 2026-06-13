# Shepherd ↔ Reviewer loop — PoC observations

**What this is.** Meta-observations on the prototype closed loop running in the
Identity-Foundation execution (2026-06-11 →): a **shepherd session** (pick →
refine → brief executor sub-agents → merge-gate) hands WIs at `Stage=Reviewing`
to an autonomous **reviewer session** that runs `/cosmo:review` and closes or
bounces them; the shepherd detects outcomes via a 90s Notion poll on the
workstream. Operator intent: hone the mechanism here, productionize later.
Keep this file current — one entry per observation, dated, with a
productionization implication.

## The mechanism as currently wired

- **Queue signal:** `Stage=Reviewing` (set by `/cosmo:execute complete`).
- **Pickup:** reviewer agent polls/claims autonomously (its own loop; details
  not visible to the shepherd).
- **Outcome signal back:** none, except the Stage property itself changing.
  Shepherd runs a persistent 90s poll (session-bound Monitor) emitting Stage
  transitions; reacts to `→ Closed` (sweep-check children, tracker, dispatch
  unblocked work) and to rework bounces (re-engage executor with findings).
- **Merge timing:** shepherd merges green PRs *before* review (operator-granted
  conditional authority) — review is a post-merge DoD audit, not a merge gate.

## Observations (dated)

- **2026-06-11 — children bulk-close is inconsistent across closes.** WI-570,
  WI-572, WI-574 closes swept their provenance children; the WI-571 close left
  WI-594/595 at Captured (shepherd swept manually). Same nominal gate, different
  behavior — likely two different close paths (/cosmo:review vs /cosmo:close, or
  manual variance). *Production:* children sweep must be mechanical in ONE close
  path, idempotent, and verified by the close gate itself (`dod.wp.bulk_ready`
  checks existence, not closure).
- **2026-06-11 — outcome propagation is poll-only.** The shepherd learns
  Closed/bounced by polling Notion every 90s; the monitor dies with the session
  and must be hand-restarted (tracker §5 carries the instruction). *Production:*
  an event channel (Cosmo→Inngest webhook, or reviewer posts a completion
  message to the shepherd) instead of N agents polling the same DB.
- **2026-06-11 — operator was the messenger before the monitor.** First four
  closes were relayed by the human ("569/570/571 closed") — exactly the
  coordination cost the loop exists to remove. The monitor closed that gap
  mid-PoC.
- **2026-06-11 — shepherd merge-gate and reviewer DoD audit partially overlap.**
  Both verify PR/CI state and finding dispositions. The overlap caught real
  executor mis-reports (see below), so it is NOT pure waste — but in production
  the division should be explicit: merge-gate = "is the PR really green and
  in-scope" (pre-merge, fast); review = "is the WI's AC actually satisfied"
  (post-merge, deep). Avoid double-auditing the same finding threads.
- **2026-06-11 — post-merge review means a bounce costs a follow-up PR.**
  (Updated: the first bounce, WI-583, happened to hit a PR the shepherd had
  HELD unmerged, so the follow-up-PR cost wasn't exercised — rework lands on
  the still-open PR. A bounce of an already-merged PR would cost a new PR.)
  Acceptable pre-launch; for production decide per-risk-class whether review
  gates the merge (e.g. `risky` WPs) or trails it (`standard`).
- **2026-06-11 — executor failure modes the gates caught (4 distinct):**
  (1) stale-green reporting — "all checks green" from the previous CI run while
  the final commit was still pending (WI-571, WI-583 partially);
  (2) committed plan file (`_plan-WI-571.md`);
  (3) finding mis-reported as fixed — WI-583 conflated the safeSend *label* with
  the Inngest event *name*, reported a CodeRabbit Major addressed when the code
  diverged;
  (4) wrong-tree editing — WI-576 created its worktree, then edited the shared
  main checkout anyway.
  *Production:* (1),(2) are mechanically checkable (a pre-complete script:
  checks-on-HEAD green + no `_plan-*` in diff); (4) is checkable (executor CWD
  assertion before first edit); only (3) genuinely needs a judgment gate.
- **2026-06-11 — executors stall at the commit→PR seam (recurring, 2×).**
  WI-575 and WI-576 both ended their turn right after `/commit` pushed the
  branch — implementation done, no PR opened, no completion — and needed a
  shepherd nudge to resume Phase 5. Likely cause: the commit skill runs as a
  forked execution and its return reads like a natural stopping point.
  *Production:* the protocol's phase chain needs an explicit "the turn does NOT
  end at push" instruction, or the dispatch harness should auto-resume an
  executor whose WI is still claimed but whose turn ended pre-`complete`.
- **2026-06-11 — FIRST BOUNCE observed (WI-583); the bounce contract revealed
  itself.** The reviewer rejected with: page comment `[zdx:review] Rejected —
  Stage → Executing (tag: rework)` listing concrete DoD failures with live
  GitHub evidence, Stage set back to `Executing`, claim left EMPTY. The
  shepherd's monitor caught the transition in <90s; findings relayed to the
  original executor within minutes. The contract works: findings on the page,
  Stage as the signal, unclaimed = anyone may pick up. *Production:* codify
  exactly this (comment tag + Stage + claim-release), and have the bounce
  notify the claimant-of-record rather than relying on shepherd relay.
- **2026-06-11 — reviewer audited a moving target (race between shepherd hold
  and reviewer pickup).** WI-583 sat at Stage=Reviewing while the shepherd had
  already HELD its PR at the merge gate and sent the executor back to rework —
  the hold was PR-level state, invisible in Cosmo. The reviewer then audited
  mid-rework (stale Fixed In, CI pending on a moving head) and bounced. Outcome
  was correct and convergent (both gates rejected), but the review was spent on
  a known-dirty artifact. *Production:* a shepherd merge-gate hold must reflect
  in Cosmo immediately (set Stage back to Executing, or a `hold` tag the
  reviewer skips) so review effort is only spent on shepherd-passed items.
- **2026-06-11 — reviewer added genuine value beyond the shepherd gate.** Its
  rejection included a finding the merge gate missed: `previousTier` read
  before the transaction in revenuecat.ts (concurrency staleness). Two
  independent judgment layers caught disjoint defect sets — evidence the
  post-merge-audit layer earns its cost even with a strong merge gate.

- **2026-06-11 — first fully-autonomous happy path (WI-584).** Executor built
  and completed → shepherd merge-gated and merged → reviewer audited and
  Closed/Done — no human action at any step (operator reviews up to WI-574 were
  manual; this one wasn't). Monitor caught the close within its 90s window.
  Solo Item, so the children-sweep variable wasn't exercised; the first
  autonomous WP close will test that.

- **2026-06-11 — green→merge seam: executor CI-waiters don't survive turn end
  (3rd seam instance).** WI-575's executor armed a background CI waiter and
  ended its turn; PR #882 went fully green but no green-report ever arrived —
  the shepherd discovered it by polling after compaction, ran the merge gate,
  merged, and had to resume the executor by message to fire `complete`. Same
  family as the commit→PR stalls: any executor hand-off that relies on "I'll
  wake when X" dies silently if the waiter is bound to a finished turn.
  *Production:* the shepherd (or harness) should own all cross-turn waits —
  executors report state and end; wake-ups are the coordinator's job.

- **2026-06-11 — the children gate flipped direction (WI-575 bounce).** Earlier
  reviewer passes (WI-570/572/574) swept provenance children closed themselves;
  this pass instead REJECTED the parent because WI-600/601 sat at Captured —
  "DoD requires WP children bulk-closed with the same Fixed In before parent
  closure" — while explicitly confirming the code evidence was fine. So the
  children inconsistency logged earlier now has both polarities: sometimes the
  reviewer sweeps, sometimes it demands pre-swept children. Shepherd swept the
  two children (Closed/Done, parent's Fixed In) and restored Stage=Reviewing
  with a `[shepherd:rework]` comment; turnaround minutes. *Production:* same
  conclusion as before, now stronger — the sweep must be mechanical in ONE
  place, and the natural place is `/cosmo:execute complete` (executor side),
  so review always sees children done.
- **2026-06-11 — delegated merge authority collided with a human-only gate
  (PR #876, billing).** The WI-583 rework was shepherd-verified green, but the
  merge failed: `**/billing/**` is CODEOWNERS-matched and branch protection
  enforces `require_code_owner_reviews` (WI-538 landed) — and the PR author is
  the same identity the agents operate as, who cannot self-approve. The
  shepherd correctly stopped rather than `--admin`-bypass a deliberately-
  installed human gate. Knock-on: the reviewer bounced WI-583 for the unmerged
  PR — the WI is now in a loop no agent can exit (review demands merged; merge
  demands a human). *Production:* the orchestration needs a "blocked-on-human"
  terminal state distinct from rework, and the agent identity model must
  account for CODEOWNERS self-approval rules (separate reviewer identity, or
  route such WPs to a human-merge lane from the start).
- **2026-06-11 — green check ≠ no findings, proven live (PR #888).** The
  `claude-review` CHECK was green while the review COMMENT carried verdict
  CHANGES_REQUESTED (GC6 should-fix). A merge gate keyed on checks alone would
  have merged it; the repo's own protocol (read the comment, triage findings)
  caught it. *Production:* the merge gate must always parse the review verdict
  artifact, never the check colour.

- **2026-06-11 — the predicted follow-up-PR cost materialized (WI-583, bounce
  #3).** The reviewer's third pass found a VALID residual the first rework
  missed: the stale-previousTier fix was applied to the RevenueCat webhook
  path but not its Stripe sibling (`handleTierChange`). Because PR #876 was
  already merged by then, this rework costs a fresh branch + follow-up PR —
  exactly the cost the post-merge-review entry predicted. Also the reviewer's
  SECOND disjoint catch on this WI (merge gate verified the reported fix
  rather than re-deriving all sibling sites). *Production:* (a) sibling-sweep
  should be an explicit rework-instruction template item, not left to the
  executor's recall; (b) a reviewer finding that names a code location should
  flow into the next executor brief verbatim — the relay worked, keep it.

- **2026-06-11 — the reviewer side keeps its own mirror log** —
  `review-loop-reviewer-observations.md` (same directory, written by the
  reviewer session; discovered untracked in the shared tree). Read both
  together: the two sides independently converged on the same #1 defect (WP
  child closure has no single owner — reviewer bounces conservatively when
  children are open) and the same hold-visibility gap. Reviewer-side detail
  worth noting: their watcher v2 polls at 60s, de-dupes by transition key
  (not item id — which is why rework cycles re-trigger correctly), and
  launches `codex exec` review agents directly; their open questions #7/#9
  pair with this file's #5 and the hold observation.
- **2026-06-11 — LOOP IMPROVEMENT ADOPTED (shepherd side): children swept at
  merge time.** Since the reviewer's DoD demands WP children Closed with the
  parent's Fixed In *before* parent review, and `/cosmo:execute complete`
  doesn't do it, every remaining WP would bounce once by construction. New
  standing shepherd step: immediately after merging a WP's PR (and before or
  while the executor fires `complete`), the shepherd closes the WP's
  provenance children (Stage=Closed, Resolution=Done, Fixed In = landed
  commit). Applies to WI-576/577/578/579/581/582/585/586. The real fix
  remains: fold the sweep into `complete` itself.

- **2026-06-11 — merge-time children sweep VALIDATED (WI-576); first WP
  through the fully-autonomous close.** WI-576 closed Done on the reviewer's
  FIRST pass — no children bounce — with provenance children WI-602/603
  pre-swept by the shepherd at merge time. Contrast: WI-575 and WI-583, whose
  children were swept only after a bounce, each cost a full review round.
  WI-576 is also the first children-bearing WP through the loop with zero
  human touches end-to-end (executor → shepherd gate caught a GC6 finding →
  fix round → merge → sweep → reviewer close). *Production:* confirms the
  sweep belongs before review — fold it into `/cosmo:execute complete`.

- **2026-06-11 — repo gates teach the fleet mid-wave, but only if the shepherd
  relays.** GC6 cost two executors a fix round in two different flavors
  (WI-576: mock not converted; WI-579: mocks gc1-allow'd but no commit-message
  deferral record). After the second hit the shepherd pushed a brief amendment
  to the two still-building executors (WI-577/581) covering the precise gap +
  the two recurring considers (exported return types, no ticket tokens in
  source comments). *Production:* executor briefs should be generated from a
  living checklist that accretes each review-gate lesson automatically —
  the shepherd-as-relay works but doesn't scale past one wave.
- **2026-06-11 — first CI-infra noise hit the loop (PR #902).** The only red
  check was a mobile timing test (`create-profile.test.tsx` duplicate-submit
  lock) on an API-only diff — flake or pre-existing, not the executor's. The
  loop's risk: an executor that trusts check colour would chase it; a gate
  that auto-bounces on red would too. Disposition: executor evidences
  non-causation, shepherd treats recurrence as an infra matter (separate WI),
  not a rework bounce. *Production:* the merge gate needs a flake/unrelated-
  failure lane distinct from "fix your PR".

- **2026-06-11 — the blocked-on-human loop was resolved by POLICY change, not
  by a workflow lane.** Sometime after the WI-583 admin-merge ruling, the
  `require_code_owner_reviews` requirement disappeared from branch protection
  (`required_pull_request_reviews` now empty) — PR #897, touching the same
  billing paths as #876, merged plain with zero approvals. The agent-loop
  friction got fixed by lowering the human gate rather than by giving the loop
  a human-merge lane. Defensible pre-launch (the operator IS the code owner
  and rules per-PR anyway), but it means CODEOWNERS now only *requests*
  review again. *Production:* decide deliberately which gates are
  human-mandatory and give the orchestration a first-class lane for them —
  otherwise the pressure of an autonomous loop will erode the gates one
  inconvenience at a time.

- **2026-06-11 — bounce #4 on WI-583 introduced a new rejection CLASS:
  evidence-form, not defect.** The reviewer verified everything substantive
  (merged PR, green CI, focused suites, children aligned) but rejected because
  the completion summary lacks red-green-REVERT proof for the F-124
  regression, explicitly offering a human-ruling exit. The shepherd kept the
  loop autonomous: executor produces the revert-proof in a throwaway worktree
  and re-completes. Two lessons: (a) the DoD's evidence-form requirements must
  be in the EXECUTOR's brief from the start — producing revert-proof at build
  time costs minutes, producing it post-hoc costs a full bounce cycle;
  (b) reviewer-offered "human ruling" exits are pressure valves the shepherd
  should decline when the evidence is mechanically producible — rulings spend
  operator attention and erode the DoD. WI-583's bounce tally: children gate,
  unmerged PR + children, residual defect (valid), evidence form — four
  different classes on one WI.

- **2026-06-11 — WI-583 closed on pass 5: the loop's stress test ended
  convergent.** Final tally for the hardest WI: 2 PRs (#876 held + reworked,
  #897 follow-up), 4 bounces in 4 distinct classes, 3 genuinely distinct code
  defects caught across three independent reviewers (merge-gate: payload
  divergence; Cosmo reviewer: stale pre-tx read; Codex: missing row-level
  serialization), 1 evidence-form round. Every bounce made the artifact
  better; nothing was rubber-stamped; the loop never needed a human after the
  one CODEOWNERS ruling. Cost: ~5 review passes and ~6 executor rounds for
  one P1 WP — acceptable for billing-correctness code, far too heavy as a
  default. *Production:* per-risk-class DoD depth (this WI deserved the full
  gauntlet; a docs WP does not) is the single highest-leverage tuning knob.

- **2026-06-11 — the reviewer's DoD bar keeps revealing itself one bounce at a
  time (WI-581).** After five clean WP closes, a NEW evidence-form
  requirement surfaced: the PR body must list child WI ids explicitly (finding
  ids aren't enough), and children must carry Completed dates. Both were
  shepherd-side fixes (minutes), but the pattern is structural: the manual-DoD
  checklist lives in the reviewer's judgment and is only discoverable by
  failing it. *Production:* the close-evidence contract (what `complete` +
  the PR must contain, field by field) must be a published artifact both
  executor and shepherd can satisfy proactively — not an oral tradition
  reconstructed from bounce messages. Tally of distinct DoD facets learned by
  bounce so far: children closed, same Fixed In, merged-on-base, revert-proof,
  child-ids-in-PR-body, Completed dates.

- **2026-06-11 — review-round convergence measured live (PR #933 / WI-578) and
  the 3-round cap exercised.** Four gate rounds, each finding defects ONLY in
  the previous round's new code (round 1: 3 findings on the base diff; round
  2: 1 should-fix + 3 minors on round-1 code; round 3: 1 should-fix on
  round-1 code). The series converges — each round's diff shrinks — but the
  whack-a-mole tail is real. At the cap the shepherd made the severity call:
  the final should-fix (business logic in an Inngest file, pure placement)
  could not be waived because the operator's merge-gate ruling demands zero
  unresolved should-fixes, so it became one surgical move-only round with a
  hard scope fence ("no logic changes; ignore any further review output").
  *Production:* the cap's exit must be exactly this — shepherd severity call
  with a scope-fenced final round or an explicit operator waiver lane; and
  large WPs (28 files) should expect 3-4 rounds as the norm, not a smell.

- **2026-06-13 — the pre-execution STOP earned its keep twice on WI-689 (CUT-A,
  the foundational cutover migration).** (1) *Plan-vs-reality gap.* The mandated
  generate-preflight surfaced **four** categories of pre-existing TS↔journal
  baseline drift — the ratified plan anticipated only one (`concepts`/
  `concept_mastery`). The other three (unique-constraint→index, CHECK rename,
  column default) were latent on `main` before CUT-A started. The shepherd's
  value at the STOP was adding three safety gates the executor's "reconcile it
  all" proposal lacked: FK-target safety (a unique *index* can't always serve an
  FK reference target, so constraint→index isn't a free no-op), physical-existence
  (`IF NOT EXISTS` vs real CREATE — the tables pre-exist on push-managed dev), and
  live constraint-name verification + `IF EXISTS` guards (dev/stg are journal-
  drifted; `drizzle-kit migrate` aborted on this exact class in WI-585). Ruling:
  the fix *rides the WI as a separated `0113` migration* per the plan's "stray DDL
  → its own migration" clause — NOT a separate WI (avoids critical-path latency).
  (2) *Dev-homogeneity blind spot.* The executor's pre-PR adversarial self-review
  caught a genuine convergence-freeze abort — an unguarded `actor_id` FK in the
  reseed that 23503-aborts on any `parent_reported` row whose parent person is
  absent — that **dev data structurally could not surface** (all 173 dev rows are
  `self_report`, actor_id null). *Production implications:* (a) foundational/
  data-migration units warrant a mandated pre-PR "what does prod/staging data
  exercise that dev's distribution does not?" self-review pass — homogeneous dev
  data hides whole branches; (b) a generate-preflight belongs in the protocol for
  ANY unit that runs `drizzle-kit generate` after an upstream merge, not just CUT-A;
  (c) the per-risk-class DoD-depth knob extends upstream to DoR/STOP placement —
  the foundational unit's phase-0 STOP caught two issues that a straight-to-PR flow
  would have pushed into the CI/review loop (or worse, the staging freeze).

- **2026-06-13 — the CUT-B wave: the gate caught a real defect in every single
  unit, several of which a green-CI read would have shipped.** Tally across the
  application cutover: CUT-A (2 — actor_id convergence-abort via self-review, the
  F14 RLS false-positive), CUT-B1 (8 — consent tiebreak, BUG-411 discrimination,
  multi-membership fail-closed, TOCTOU, escalation parity, …), CUT-B2 (deletion
  erase-vs-rehome + 2 child-safety concurrency races), CUT-B3 (a v2-cancel
  split-brain). Three patterns worth productionizing:
  - **"Behavior-preserving" is a trap when the NEW schema forbids the old
    behavior.** CUT-B2's executor planned to ERASE `consent_grant` on deletion
    (mirroring legacy's cascade) — which the new model's `ON DELETE RESTRICT` +
    retain-tier were *explicitly designed to prevent* (canon §6.1: re-home the
    receipt, don't destroy it). The catch came from the shepherd **verifying the
    plan against canon instead of rubber-stamping it** — the executor even cited
    "§4.8 re-home" while recommending erase. Lesson: at a cutover phase-0, diff the
    proposed behavior against the *new* schema's intent, not just the legacy one;
    a `RESTRICT`/retain-tier is a deliberate signal that the legacy behavior is the
    bug being fixed.
  - **Concurrency guards silently dropped in the re-write are the highest-severity
    misses.** CUT-B2's v2 deletion dropped legacy's request-*generation* window
    (`requested_at >= requestedAt`) and lacked the restore-vs-delete lock — two
    races that could *wrongfully delete a child*. The reviewer (Codex) caught both
    as P1; the shepherd triaged them to the WI-583 advisory-lock pattern. Lesson:
    when re-platforming a guarded delete/update, enumerate the legacy guards
    (generation windows, `FOR UPDATE`, advisory locks) and require each to be
    re-proven red-green on the v2 path — they don't show up in a happy-path diff.
  - **Stall recovery must RE-VERIFY, not blind-ship the branch.** CUT-B2's executor
    stalled (watchdog) mid-final-verify with the implementation committed but
    unpushed. Re-dispatching a fresh executor *to run the verification the dead one
    didn't finish* caught a real unguarded `weekly-progress-push` legacy query
    before the PR opened. Lesson: the recovery brief for a stalled executor is
    "verify + ship," never "just push what's there" — the stall often happens
    *because* verification was about to surface something.

## Open design questions for productionization

1. Event-driven outcome channel vs polling (and who owns the monitor when no
   shepherd session is alive).
2. Bounce contract: Stage, claim, findings location, executor re-engagement.
3. Merge-gate placement per risk class (pre-review merge vs review-gated merge).
4. Mechanize the cheap executor checks (green-on-HEAD, plan-file, CWD) into
   the protocol/harness so shepherd judgment is spent only on substance.
5. Children/provenance sweep as a mechanical part of the close path.
6. Claim-collision rules between shepherd, reviewer, and executors (none seen
   yet; untested under contention).
