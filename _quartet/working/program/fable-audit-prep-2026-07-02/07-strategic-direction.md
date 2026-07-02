# 07 — Strategic Direction: halt / push / adjust?

Companion to `06-fable-audit.md`. This is the zoom-out: given everything in flight vs the audit
findings, what's the right next move. Written to be unbiased by how the current plan looks.

## The question is partly the wrong one

The three options — halt-and-re-evaluate / push-on-and-fix-at-end / open-brain-surgery — all share two
hidden assumptions that the evidence contradicts:

1. **They assume a lot of work is actively executing**, so the choice is about how to handle a running
   machine. It isn't. Of ~100 non-closed Cosmo items, **5 are Executing**; the rest is queue (55 Captured
   ≈ un-triaged inbox, 33 Ready, 3 Reviewing). Of the 5 executing, exactly **one** is cutover work
   (WI-1128 FK-repoint — and it's on hold pending the 779 decision). The real asset at risk is not running
   work — it's **the 88-item queue and the stale map that generated it.**
2. **They treat this as surgery on a live system.** There are **zero production users** (prod v2 parents
   empty, verified). This is not a patient on a table; it's **renovation of an empty building.** That single
   fact should invert the risk posture from "delicate" to "decisive."

So the useful distinction the three options blur: **halting *execution*** (cheap here — little is running,
but also low-benefit for the same reason) is a different lever from **re-baselining the *plan and queue***
(high-benefit — that's where the misalignment actually lives). The right answer operates the second lever,
not the first.

## What the audit says about whether the in-flight work is even wrong

Mostly it is *not* wrong — it's correct work missing a spine:

- The cutover is **done at the live-code level** (zero live legacy readers). What remains is convergence
  hygiene (envs, CI, journal) + deletion of dead legacy. That's cleanup, not construction.
- The V2 supporter gap the canonical plan calls "the critical publish blocker" is **already closed**
  (WI-1170/1171 shipped to their ACs). The plan is chasing a resolved blocker and hasn't noticed.
- WS-18 (cutover) is literally reader-convergence + strip; WS-28 is V2 finalization. **Both workstreams are
  already aimed at the convergence goal.** The gap is not direction — it's the absence of one coordinating
  architecture across front and back, and the plan-vs-reality drift (thinks supporter gap open, cutover
  terminal), plus a couple of findings **no workstream owns** (the authority-key IDOR R1; the flag-combo
  dead zones R9).

Read plainly: you don't have a wrong-work problem. You have a **stale-map + no-spine + two-unowned-risks**
problem. That is not a halt-and-restart situation.

## Verdict on each option

- **Halt + full re-evaluation + restart — NO.** Halting is the reflex of feeling out of control; the data
  says you're more in control than it feels. Little is executing, so a stop saves little. The team's problem
  was never a *shortage of plans* (there are dossiers, phase plans, canonical plans, ADRs) — it was the
  absence of *one* plan both halves obey. A full stop also has real cost: context evaporation on a small
  team, worse shared-checkout churn, slow re-mobilization. You'd pay a high price to produce another plan on
  top of the pile.
- **Push on, fix at the end — NO.** This is exactly the pattern that produced the tangle: parallel execution
  without a reconciling spine, integration deferred to "later." Doubling down reproduces the mess. And the
  authority-key finding (R1) gets *harder* to fix as more call sites pile on the wrong guard — "fix at the
  end" for a security-authority error means retrofitting it across a bigger surface.
- **Open brain surgery — CLOSEST, but wrong metaphor.** "Surgery" implies a live patient who dies if you
  slip. There's no patient. So the posture shouldn't be *delicate* — it should be *decisive*. You can knock
  down walls (delete V0, strip legacy) because nobody lives here yet.

## The actual recommendation

**Don't halt. Impose the spine, correct the map, freeze only the irreversible — then let the (correctly
aimed) work continue under it.** Concretely, in order:

1. **Freeze only the irreversible — nothing else.** The one class that must not race ahead while you align
   is destructive, no-rollback steps: S6 deletions, the terminal drop promotion (WI-1128 full / WI-779
   strip). Those are *already* gated (S6 deferred + human-confirm). So this step is mostly "keep the gate you
   have." Everything reversible keeps moving. **Exception that continues regardless: the safety item**
   (minor-routed model leaking synthesis instructions) — that's a real content-safety defect unrelated to
   the version mess; it must not be caught in any freeze.
2. **Correct the map before re-prioritizing the queue (days, not a quarter).** The canonical plan believes
   the supporter gap is the blocker (closed) and the cutover is terminal (done at code level). Re-baseline it
   against reality first — this session already found two big things resolved that the plan lists as open, so
   a meaningful fraction of "remaining work" may already be done. Re-triage the 55 Captured against the
   corrected goal; most of that inbox is noise to kill, not commitment.
3. **Write the ONE spine — the missing artifact.** Not a re-evaluation from scratch; a crystallization of
   what's already true into a single authority both halves obey: the two supported configs (V2 target + V1
   fallback, both on the v2 backend), the target env triple, the seam-DTO promoted to a named contract, and
   the ordered collapse with gates. `06`'s roadmap is ~80% of the raw material. Days of work.
4. **Assign the two unowned findings now.** R1 (authority-key IDOR) and R9 (flag-combo dead zones) have no
   workstream. Give them owners immediately — independent of the spine, independent of the cutover.
5. **Then execute the collapse — aggressively, because it's free now.** With no users, killing V0, stripping
   legacy, converging envs is low-risk mechanical work a small team grinds through fast once the spine says
   what stays.

This is a *version* of "adjust while executing" — but the framing is renovation, not surgery: keep the
lights on, freeze the one wall you can't rebuild, and be decisive with the rest.

## The strategic gift you're underusing

**No users is not just a safety fact — it's leverage you're paying to ignore.** You've been carrying the
operational cost of a production system (PITR markers before every drop, staged rollouts, keeping V0/V1/V2
all alive "to be safe") to protect users who don't exist yet. The correct pre-launch posture is the
opposite of caution: **delete brutally now, because the window to simplify for free closes the day you
launch.** Every week you keep three shells and a dead legacy subtree alive is a week you're paying
launch-grade caution for pre-launch code. The single highest-leverage mindset change is to stop treating
reversible-and-userless changes as if they were risky.

## Why the reconciliation is smaller than it feels

"Reconcile front/back, V1/V2" sounds like a big re-architecture. It isn't, because **the backend already
won** (cutover done) and **the front-end's target already consumes it** through a working DTO (V1 runs on
the v2 backend today, on preview/staging). So reconciliation is mostly:
(a) **name the DTO seam as a real, hardened contract** (that's R1 + R6 + the SBF-004 finding), and
(b) **delete the alternatives** (V0, legacy subtree).
It's convergence **by subtraction**, not integration by construction. The thing that makes it feel huge —
the tangled matrix — shrinks fast once you stop preserving cells you'll never ship.

## The part that isn't technical

The tangle came from an instinct to preserve every version as live code (the "two front ends to play with"
hope). If the spine is only a technical document, the instinct regrows the tangle. The spine's real job is
**social**: a shared, owned contract — "two configs, release-not-code preservation, no unsanctioned flag
combos" — that stops the *next* parallel divergence. So **who owns and enforces the spine matters more than
its contents.** Name that owner as step zero.

## One-line answer

Don't halt (little is running); don't push-and-hope (that's how you got here); don't do delicate surgery
(there's no patient). **Correct the stale map, write the one spine, freeze only the irreversible, assign the
two unowned risks — then delete aggressively, because pre-launch with zero users is the cheapest this
cleanup will ever be.**
