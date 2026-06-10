---
title: WI-587 ruling sheet — 19 memory decisions for the PM
date: 2026-06-10
audience: Zuzana (PM) — written to be decidable without follow-up questions
source: memory-cleanup.md (full 55-memory triage results, same folder)
status: AWAITING RULINGS
---

# WI-587 — Ruling sheet

## What this is and how to use it

The AI agents working on this repo keep a folder of working notes ("memories")
that steer their behavior — things like *"never push app updates without
asking"* or *"the pricing tiers are X"*. We audited all 55 of them. 36 were
handled already (stale ones archived, wrong facts corrected). **These 19 need a
human ruling** because they record *your preferences* or *product facts* that
an agent shouldn't confirm on its own behalf.

**How to use it:** work top-down, tick a box per item (or write a line where
you disagree). Part 1 is the only item that needs real thought. Parts 2 and 3
should each take a few minutes — every item has a recommendation, and "agree"
is a fine answer. ~20 minutes total.

**What happens after:** an agent executes your rulings (small file edits +
one PRD fix). Nothing is edited until the in-flight harness-hygiene branch
merges, to avoid edit collisions — your decisions are not time-sensitive to
that; rule whenever suits you.

---

## Part 1 — The one real decision: topic locking

**This is a product-behavior contradiction that three documents currently
answer differently.** It's about what happens when a topic has a REQUIRED
prerequisite the learner hasn't mastered yet.

The three positions:

1. **Your standing instruction (the memory, from Epic 7):** never lock a
   topic. REQUIRED prerequisites behave like recommendations — the learner
   always gets in; the tutor sees the gap and adapts (warns, fills in
   background as it teaches).
2. **The PRD's definition section (PRD line 1371, FR119):** "REQUIRED — topic
   is **locked** until prerequisite reaches 'strong' retention."
3. **The PRD's own behavior rule two sections earlier (FR124, line 1365):**
   when a learner skips a prerequisite, "dependent topics **remain
   accessible**" — i.e. no lock.

So the PRD contradicts *itself*, and your instruction agrees with one half of
it. There is no ADR settling this. (Historical note: the Epic 7 redesign in
April abolished prerequisites entirely; the living PRD later reinstated
REQUIRED-with-locking, apparently without anyone reconciling it against FR124
or your instruction.)

**What the choice means for learners:**

- **Never lock (A):** a learner can always open any topic. If prerequisites
  are missing, the tutor knows and compensates. Risk: a learner far out of
  their depth has a frustrating session — mitigated by the tutor seeing the
  gap. This matches the product's general posture everywhere else (never force
  add-child, human override everywhere, quiet defaults).
- **Hard lock (B):** the app refuses entry until the prerequisite shows strong
  retention. Protects against out-of-depth sessions, but it's the only hard
  gate of its kind in the product, contradicts FR124, and contradicts your
  recorded instruction.

**Recommendation: A — never lock.** REQUIRED becomes an advisory signal
(strong warning + tutor context), FR119's "locked until" wording gets
rewritten to match FR124, and the memory stays (updated to cite the fixed
PRD). If instead you now want hard locking, we'd fix FR124 the other way and
archive the memory. Either ruling also triggers a quick check of what the app
*actually does* today, so code, PRD, and memory end up aligned.

> **Decide 1 — topic locking:**
> ☐ **A — never lock** (advisory REQUIRED; fix FR119 wording; keep memory) *(recommended)*
> ☐ **B — hard lock** (FR119 stands; fix FR124; archive memory)
> ☐ Other: ___________

---

## Part 2 — Ten standing rules: still what you want? (confirm-only)

These ten notes record preferences and lessons the agents follow every day.
The audit verified each one is still factually accurate and written down
nowhere else — so if a rule is wrong or outdated, **this is the only place it
can be fixed**. For each: *this is the rule the agents follow — is it still
right?* Expected answer for most or all: yes.

| # | The rule the agents follow | Worth knowing |
|---|---|---|
| 2.1 | **Never push an over-the-air app update to users unless explicitly asked.** | Your product-risk guard on OTA releases. |
| 2.2 | **Never switch git branches mid-session unless explicitly told** (applies to sub-agents too). | Prevents agents trampling each other's work. |
| 2.3 | **All user-facing text in plain language — no app jargon — for all ages.** Includes six concrete banned-jargon examples ("Coaching card", "Retention", "Curriculum"…) and the "say the moment, not the system" heuristic. | The examples exist only here; the UX spec has the general principle but not the list. |
| 2.4 | **Quiet defaults over friction:** infer from sustained behavior, don't nag with settings or confirmations; surveillance and friction are both UX bugs. | From three of your spec reviews. |
| 2.5 | **When testing app flows, track findings silently and report at the end** — no play-by-play commentary. | Your stated working preference. |
| 2.6 | **Use the cheaper Sonnet model for sub-tasks; reserve Opus for deep reasoning.** | Cost control you requested. |
| 2.7 | **Layouts must be checked against a small phone — Galaxy S10e, 5.8".** | True as long as that's still the test device. If you've changed devices, say so and we update it. |
| 2.8 | **Agents decide small things themselves; ask only on genuinely big trade-offs.** | Your "don't gate on confirmations" instruction. |
| 2.9 | **Audit methodology: before flagging a "rule violation", check whether a later epic deleted the concept** (greps miss renames/removals). | A lesson from a real false alarm. |
| 2.10 | **LLM injection checklist: any flow where the AI reads one user's text and shows output to another user is an injection vector** — five required mitigations (structured output, delimiter wrapping, allowlist validation, a break test, DPA scope note). | Security pattern from a real incident; in no other doc. |

> **Decide 2 — standing rules:**
> ☐ **Confirm all ten as still-current** *(recommended)*
> ☐ Confirm all EXCEPT: #____ — what changed: ___________

---

## Part 3 — Eight factual corrections: approve the edits (batch)

These notes have the right *idea* but contain specific stale facts the audit
verified against the codebase. The proposed edit is listed per item; nothing
else in each note changes. These are corrections, not judgment calls — the
ruling asked of you is "go ahead" (or pull one out if something looks off).

**Two product-relevant ones, spelled out:**

- **3.1 — Voice is critical.** The core principle stays untouched: voice
  input AND output are product-critical because young learners don't type.
  Two stale facts get fixed: (a) the note says TTS "should be the default
  output mode" — what actually shipped (FR144) is a per-session Text/Voice
  toggle, with voice-on default only in Teach-Back mode (FR142); (b) it still
  frames Epic 8 as upcoming — it shipped in April. A pointer to the Epic 17
  voice-first design (the actual next phase, not started) is added.
- **3.2 — Never force add-child.** The principle stays untouched: a parent
  account must never be forced to add a child; solo/skip path always
  available. One paragraph gets deleted: the "how to apply" block names a
  screen (`AddFirstChildScreen`) and a code check that no longer exist
  anywhere in the codebase.

**Six mechanical ones, one line each:**

- **3.3 — Login keys (Clerk).** Note says the mobile key is "baked into
  eas.json"; in reality it's injected at build time via EAS environment
  variables. Fix the wording; drop a resolved-incident history block.
- **3.4 — Build setup (EAS).** Two sections duplicate the deployment doc —
  replaced with pointers; one detail with no other home (where the Sentry
  upload token lives) is explicitly kept.
- **3.5 — LLM test harness.** Says "all 10 LLM flows wired" — there are now
  23. Fix the count; remove a paragraph describing a file that doesn't exist;
  point to the harness README instead of paraphrasing it.
- **3.6 — Windows build bug (nx/expo).** References a script that was retired
  in the pipeline rework; updated to the current script and the current
  (sanctioned, narrow) bypass policy.
- **3.7 — Secrets how-to (Doppler).** Removes a claim the code contradicts (a
  test it says needs a live database explicitly doesn't) and old PR history;
  the verified how-to table stays.
- **3.8 — Secrets rule (Doppler/EAS).** Fixes a wrong command name (`eas
  env:create`, not `eas secret:create`) and a wrongly-named variable; points
  to the canonical secrets doc; the Windows CLI path stays.

> **Decide 3 — corrections:**
> ☐ **Approve all eight** *(recommended)*
> ☐ Approve all EXCEPT: #____ — concern: ___________

---

## After you rule

1. Hand this sheet back (ticked boxes are enough; margin notes welcome).
2. An agent executes: the 8 edits + the Part 1 outcome (PRD fix + memory
   update **in the same change**, so the contradiction can't reopen), then
   marks the 10 confirmations as re-confirmed today.
3. Execution waits for the harness-hygiene branch to merge (same files in
   flight there); expected within days. Your rulings can land any time before
   or after that.
4. Everything is recorded on Cosmo **WI-587**, which then goes to review.
