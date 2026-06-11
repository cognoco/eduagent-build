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
