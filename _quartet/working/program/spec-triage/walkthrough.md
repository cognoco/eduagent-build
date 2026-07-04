# Phase-3 walkthrough — the seven product decisions

**Purpose.** This document is a facilitation script. It is written to be handed to an agent who runs an **interactive, item-by-item walkthrough** with Zuzka (Product), capturing one ruling at a time. It replaces the earlier fill-in-the-blank ballot.

**Canonical copy:** `_quartet/working/program/spec-triage/walkthrough.md` on eduagent-build main. Notion mirror: child page of the PGM-1 "Mentomate productization" row. Rulings are captured in the Notion copy; the repo copy is the reference text.

---

## Instructions for the facilitating agent

1. Work **one item at a time**, in order. For each: present the issue in plain English, then the consequences, then the options with pros and cons, then the recommendation. Do not dump all seven at once.
2. After presenting an item, ask for a ruling. Accept "go with the recommendation" as a valid ruling. Accept "park this one" — record it as PARKED and move on.
3. Record each ruling **verbatim** under the item's `RULING:` line in the Notion copy, with date and who ruled.
4. Items marked ⚠ need Jørn's co-sign (they touch architecture/tech, calendar, or spend). If Zuzka rules a ⚠ item, record it as `RULED (pending Jørn co-sign)`.
5. If Zuzka challenges the underlying evidence, do not argue from this document — point her at the cited disposition sheet in `_quartet/working/program/spec-triage/sheets/` and record the challenge.
6. When all seven are ruled or parked, post a summary comment on the page tagging the program manager: rulings list, parked list, anything contested. Phase 4 (execution of all fates) starts from that comment.

---

## Why these seven questions — and not 70

The triage started with **~25 spec/plan documents and ~95 candidate work items** (83 quarantined + 12 later "execution candidates"). Almost all of that has already been resolved **without needing product judgment**, because the evidence decided it:

- **9 documents** turned out to be fully shipped, superseded, or the live program itself — nothing to decide.
- **10 candidates were closed on facts**: the work was already done, the premise was verifiably false in current code, or the target screen no longer exists in the V2 app.
- **~38 candidates defaulted to post-MVP** under the agreed bias (*"does the MVP fail without this?"* — if not, it waits). Nobody needs to re-argue each one; the default can be overridden later if data says otherwise.
- **Operational rulings already made by Jørn**: the supporter-linking gap will be FINISHED (WI-1393, in build now); the closed beta gates *public* launch, not store go-live; analytics is first-party; security scoping stays app-layer for launch; a coverage-debt lane absorbs the test-gap items.

What's left is the **irreducible residue**: seven questions where the evidence ran out and someone must exercise product judgment — because the answer either changes what MVP *means*, permanently kills a captured product idea, or sets a design direction that agents must not invent on their own. That's why this walkthrough is short. The 70-item pile does not need 70 decisions; it needs these seven, and then everything else executes mechanically.

---

## Item 1 — The trial preview lesson (WI-1457)

**The issue, plainly.** The onboarding spec's headline idea was: before signing up, a prospective user picks "just me" and gets a real, interactive mini-lesson — try the tutor before creating an account. That preview lesson **was never built**. What exists instead: pick a sample topic → a marketing screen → sign-up. The audit confirmed this substitute funnel works end-to-end and doesn't lie to the user.

**What hangs on the decision.** Conversion economics, mainly. A try-before-signup experience plausibly converts better, but it's a substantial feature (a sandboxed LLM session for anonymous users — cost controls, safety posture, and abuse surface for unauthenticated traffic all included). Building it now displaces launch work.

**Options.**
- **(a) OUT for MVP, revisit with funnel data.** Pros: zero launch-path cost; the current funnel is honest and functional; post-launch you'll have real drop-off data showing whether the signup wall is actually where you lose people. Cons: if the wall IS the problem, you find out after launch, not before.
- **(b) Build it for MVP.** Pros: strongest possible first impression; differentiator. Cons: weeks of work on the critical path; anonymous LLM access needs its own safety/cost design; delays launch for an unproven conversion hypothesis.
- **(c) Cheap middle: a non-interactive "watch a sample lesson" (canned replay).** Pros: days not weeks; some try-before-buy feel. Cons: canned content can underwhelm; still new build on the path.

**Recommendation: (a).** Rationale: it's an unproven hypothesis competing against known launch work; the honest funnel already works; post-launch funnel data converts this from a guess into an evidence-based decision.

RULING: ___

---

## Item 2 — The answer-correctness chain (WI-1443 → WI-1444 → WI-1445) ⚠

**The issue, plainly.** Three linked improvements to how the tutor tracks whether a learner actually answered correctly: (1) make the LLM report, turn by turn, a structured "was that answer right?" signal; (2) use it to wire up (or finally delete) the half-built "three strikes → change teaching approach" system that currently sits stranded in the code; (3) use it to set review dates when a Challenge Round verifies mastery. It's one epic in practice — each step feeds the next.

**What hangs on the decision.** Pedagogy quality vs. launch focus. Today's live loop works without it (reviews get scheduled, mastery gets verified) — this chain makes the *adaptive* behavior real instead of decorative. It is ⚠ because step 1 changes the LLM response envelope — a load-bearing API contract with its own eval-harness and hard-cap rules.

**Options.**
- **(a) Fast-follow (first post-launch epic).** Pros: keeps a contract-touching change off the launch path; done unhurried with proper eval runs; launch pedagogy is already acceptable. Cons: the three-strike dead code ships dormant one more cycle.
- **(b) MVP slot.** Pros: launch tutoring is adaptively smarter. Cons: envelope changes ripple through eval snapshots, server caps, and tests at exactly the wrong time; effort is significant (size ~50 across the chain).
- **(c) Split: do only step 3 (write review dates on Challenge mastery) now.** Pros: it's the smallest and most self-contained; closes a real gap (WI-1445 is typed as a bug). Cons: without step 1 its trigger coverage is partial; the chain gets built twice.

**Recommendation: (a)** — with the note that WI-1445's narrow bug half is already covered in the MVP shortlist discussion (Item 7) if Zuzka wants the minimal fix sooner.

RULING: ___

---

## Item 3 — "Coming up next" in recaps (WI-1483)

**The issue, plainly.** An older plan wanted session recaps to end with a forward look — "next time we'll tackle X". The surface that idea targeted no longer exists; today's equivalent (the V2 journal) doesn't carry any "next topic" data, so this isn't a small copy tweak — it needs data plumbing plus design.

**What hangs on the decision.** Whether a captured idea survives as future work or dies as superseded UX. Nothing at launch depends on it either way.

**Options.**
- **(a) Kill; re-capture only if post-launch recap engagement suggests users want a forward look.** Pros: honest — the item as specced is unbuildable; keeps backlog clean. Cons: the idea itself is decent and killing loses the thought (mitigated: the kill note records it).
- **(b) Re-spec now against the V2 journal.** Pros: preserves the idea in executable form. Cons: design effort now for a nice-to-have with zero launch relevance.

**Recommendation: (a).** Rationale: the backlog should contain buildable items; ideas live fine in kill-note breadcrumbs until data argues for them.

RULING: ___

---

## Item 4 — Four open design forks from the coverage audit (WI-1416) ⚠

**The issue, plainly.** While auditing test coverage, four places surfaced where the *product behavior itself* is undecided — you can't test what isn't ruled. In plain terms: (1) how session provenance is displayed; (2) what a user sees when access is denied; (3) what happens when a learner returns from "parking" a session; (4) how a rare class of legacy admin rows is handled. Each open fork blocks a test item in the new coverage-debt lane.

**What hangs on the decision.** Not launch — the behaviors exist today in de-facto form; the forks are about whether de-facto is *intended*. Leaving them open just leaves four coverage items blocked.

**Options.**
- **(a) Defer all four; coverage items test current de-facto behavior with a "behavior not yet ratified" marker.** Pros: zero decision load now; tests still get written. Cons: tests may need rewriting when the forks are eventually ruled.
- **(b) Rule any fork Zuzka already has an opinion on now, defer the rest.** Pros: free wins where opinions exist. Cons: none, really.
- **(c) Rule all four now.** Pros: coverage lane fully unblocked. Cons: forces four design decisions without user data, during launch crunch.

**Recommendation: (b).** Rationale: take whatever's already decided in Zuzka's head at zero cost; don't force the rest.

RULING: ___

---

## Item 5 — Two Challenge-Round design forks (WI-1465, WI-1469) ⚠

**The issue, plainly.** Two pedagogy-architecture questions about the Challenge Round (the rigorous "prove you've mastered it" mode): (1) if a struggling learner fails and gets locked out, should there be a gentler per-concept path to re-prove themselves, or does the lockout stand? (2) the app has two mastery signals — the spaced-repetition system's and the Challenge Round's — and their formal relationship (which trumps, do they merge?) was never defined.

**What hangs on the decision.** Nothing at launch: both forks sit behind the Challenge Round production flip, which is not imminent. They matter when that flips — the second fork in particular decides what "mastered" means in the data model, which gets harder to change the longer both signals accumulate independently.

**Options.**
- **(a) Defer both to the Challenge-Round flip decision (they get ruled as part of that package).** Pros: decisions made with simulator data in hand; nothing blocked now. Cons: none material.
- **(b) Rule now.** Pros: builders get certainty early. Cons: ruling ahead of the calibration data the flip process will generate.

**Recommendation: (a).** Rationale: these are exactly the decisions the pre-flip calibration exists to inform.

RULING: ___

---

## Item 6 — The trust package: five first-session features (WI-1497, 1498, 1499, 1501, 1502)

**The issue, plainly.** Five ideas aimed at making a family's first week feel trustworthy: a "here's what your mentor will do next week" plan; a "here's what I remembered about you — keep or delete" checkpoint; a way to flag a bad tutor reply; an in-app "something wrong?" support path; a visible "I'll check this again tomorrow" review promise. All five are currently two-line ideas, tagged Design — none has a spec. They target the product's most sensitive surface (a child's first sessions), which is precisely why agents shouldn't invent their designs.

**What hangs on the decision.** First-impression quality and trust vs. launch capacity — and the safety-signal question. If any is pulled into MVP, Zuzka owes it a design pass first, and it lands on lanes that are currently saturated.

**Options.**
- **(a) All five fast-follow, EXCEPT a minimal flag-a-reply (WI-1499 v1: a "flag this" tap that records to telemetry only — no visible consequence, no moderation UI).** Pros: launch gets a safety-signal channel — meaningful for a minors product — at trivial build cost; everything needing real design gets designed properly later. Cons: a flag with no visible response can feel inert (acceptable at beta scale where every flag gets human eyes).
- **(b) All five fast-follow, no exceptions.** Pros: maximum focus. Cons: no in-product safety signal at launch; support path is just an email address.
- **(c) Pull more than 1499 forward.** Pros: stronger first impression. Cons: each needs a Zuzka design pass + saturated-lane capacity; the closed beta (already ruled) covers much of the same trust-validation ground with real families.

**Recommendation: (a).** Rationale: the safety channel is the only piece with a launch-scale argument a minors product shouldn't skip; the beta covers the rest of the trust learning.

RULING: ___

---

## Item 7 — Ratify the MVP quality shortlist (13 items)

**The issue, plainly.** The triage's bottom line: 13 items recommended as launch-quality work (beyond the already-ruled supporter-linking fix). Default is ratify-all; the walkthrough asks only whether Zuzka wants to STRIKE any (struck items move to fast-follow, they don't die). In groups:

**Six live-loop bug fixes** — real defects users would hit in week one: duplicate review-reminder pushes; review cooldowns only written when a learner *declines* (so completing one doesn't cool it down); weak topics never resurfacing for deepening; wrong-language text-to-speech for some launch locales; the push-permission toggle not registering when the OS permission is granted; a billing background job that can fail silently (banned by our own engineering rules).

**Two finish-or-hide items** — shipped affordances currently broken or about to break: the "keep this" button that silently does nothing; the concept-mastery star that vanishes when V2 navigation becomes default (a regression, not a feature ask).

**Two quality-infrastructure items** — the shipping V2 app has zero native end-to-end tests (a smoke baseline before store submission), and auth end-to-end tests cover only happy paths (add the failure branches: revoked sessions, timeouts).

**One gate ⚠** — the Challenge-Round grader model bake-off that was specced but never run; it gates the whole post-launch LLM-routing migration chain, and slots naturally before launch while eval capacity exists.

**One UX fix** — the tutor-language picker, so a parent-created child isn't stranded with an English-speaking tutor in a Norwegian home (paired with a reachability check so the fix is actually encounterable).

**One CI guard** — a cheap forward-only check that profile-scoped queries stay scoped (explicitly NOT the big security-layer activation, which is already ruled post-launch).

**What hangs on the decision.** The quality bar of the launch build, and roughly two-to-three weeks of lane capacity spread across the program (released gradually per the capacity plan — ratifying does not mean everything starts tomorrow).

**Options.** Ratify all 13 (recommended) / strike named items to fast-follow / add items back from the fast-follow pile (each addition needs a capacity conversation).

**Recommendation: ratify all 13.** Rationale: every item is either a user-visible defect, a regression, a launch-quality floor, or a gate; none is speculative feature work; and release is capacity-sequenced so ratification sets the bar without flooding lanes.

RULING: ___

---

*After the last ruling: facilitator posts the summary comment on this page (rulings / parked / contested) tagging the program manager. Phase 4 executes from that comment.*
