---
title: WI-587 ruling sheet — 19 memory decisions for the PM
date: 2026-06-10
audience: Zuzana (PM) — written to be decidable without follow-up questions
source: memory-cleanup.md (full 55-memory triage results, same folder)
status: RULED 2026-06-11 (all 19, PM via Claude Code session) — executed same day under WI-587
---

# WI-587 — Ruling sheet

## What this is and how to use it

The AI agents working on this repo keep a folder of working notes ("memories")
that steer their behavior — things like *"never push app updates without
asking"* or *"the pricing tiers are X"*. We audited all 55 of them. 36 were
handled already (stale ones archived, wrong facts corrected). **These 19 need a
human ruling** because they record *your preferences* or *product facts* that
an agent shouldn't confirm on its own behalf.

**How to use it:** work top-down and write your ruling in the right-hand
column of each row — a simple **"agree"** (or ✓) is enough; where you
disagree, a short note on what should change instead. Part 1 is the only item
that needs real thought; every other row has a recommendation. ~20 minutes
total.

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

| # | Decision | Options | Your ruling |
|---|---|---|---|
| 1.1 | Topic locking — what does REQUIRED mean? | **A** — never lock: advisory REQUIRED, fix FR119 wording, keep memory *(recommended)* · **B** — hard lock: FR119 stands, fix FR124, archive memory · or describe a third way | **A — never lock** (PM, 2026-06-11). Executed: PRD § Prerequisite Relationship Types rewritten (REQUIRED = strong advisory, FR124-consistent), memory kept + updated; code check confirms no locking logic exists — `topic_prerequisites` was never built. |

---

## Part 2 — Ten standing rules: still what you want? (confirm-only)

These ten notes record preferences and lessons the agents follow every day.
The audit verified each one is still factually accurate and written down
nowhere else — so if a rule is wrong or outdated, **this is the only place it
can be fixed**. For each: *this is the rule the agents follow — is it still
right?* Expected answer for most or all: "agree" (= keep following it).

| # | The rule the agents follow | Worth knowing | Your ruling |
|---|---|---|---|
| 2.1 | **Never push an over-the-air app update to users unless explicitly asked.** | Your product-risk guard on OTA releases. | Agree — keep (PM, 2026-06-11) |
| 2.2 | **Never switch git branches mid-session unless explicitly told** (applies to sub-agents too). | Prevents agents trampling each other's work. | Agree — keep (PM, 2026-06-11) |
| 2.3 | **All user-facing text in plain language — no app jargon — for all ages.** Includes six concrete banned-jargon examples ("Coaching card", "Retention", "Curriculum"…) and the "say the moment, not the system" heuristic. | The examples exist only here; the UX spec has the general principle but not the list. | Agree — keep (PM, 2026-06-11) |
| 2.4 | **Quiet defaults over friction:** infer from sustained behavior, don't nag with settings or confirmations; surveillance and friction are both UX bugs. | From three of your spec reviews. | Agree — keep (PM, 2026-06-11) |
| 2.5 | **When testing app flows, track findings silently and report at the end** — no play-by-play commentary. | Your stated working preference. | Agree — keep (PM, 2026-06-11) |
| 2.6 | **Use the cheaper Sonnet model for sub-tasks; reserve Opus for deep reasoning.** | Cost control you requested. | Agree — keep (PM, 2026-06-11) |
| 2.7 | **Layouts must be checked against a small phone — Galaxy S10e, 5.8".** | True as long as that's still the test device. If you've changed devices, write the new one here. | Agree — still the S10e (PM, 2026-06-11) |
| 2.8 | **Agents decide small things themselves; ask only on genuinely big trade-offs.** | Your "don't gate on confirmations" instruction. | Agree — keep (PM, 2026-06-11) |
| 2.9 | **Audit methodology: before flagging a "rule violation", check whether a later epic deleted the concept** (greps miss renames/removals). | A lesson from a real false alarm. | Agree — keep (PM, 2026-06-11) |
| 2.10 | **LLM injection checklist: any flow where the AI reads one user's text and shows output to another user is an injection vector** — five required mitigations (structured output, delimiter wrapping, allowlist validation, a break test, DPA scope note). | Security pattern from a real incident; in no other doc. | Agree — keep (PM, 2026-06-11) |

---

## Part 3 — Eight factual corrections: approve the edits

These notes have the right *idea* but contain specific stale facts the audit
verified against the codebase. Each row shows what the note wrongly says today
and exactly what we'll change it to. Nothing else in each note changes. These
are corrections, not judgment calls — expected ruling is "agree" per row, with
the column there to pull any one out.

| # | Note (what it's about) | What it wrongly says today | Proposed correction | Your ruling |
|---|---|---|---|---|
| 3.1 | **Voice is critical** — voice input AND output are product-critical because young learners don't type. *The principle itself stays untouched.* | (a) "TTS should be the **default** output mode"; (b) frames Epic 8 (voice) as upcoming — it shipped in April. | (a) Reword to what shipped: voice is a **per-session Text/Voice toggle** (FR144), voice-on by default only in Teach-Back mode (FR142). (b) Drop the Epic 8 framing; add a pointer to the Epic 17 voice-first design (the real next phase, not started). | Agree — executed (PM, 2026-06-11) |
| 3.2 | **Never force add-child** — a parent account must never be forced to add a child; solo/skip path always available. *Principle and rationale stay untouched.* | The "how to apply" paragraph names a screen (`AddFirstChildScreen`) and a code check that no longer exist anywhere in the codebase. | Delete that one paragraph. Nothing else changes. | Agree — executed (PM, 2026-06-11) |
| 3.3 | **Login keys (Clerk)** — which authentication key belongs to which environment. | Says the mobile key is "baked into eas.json" (the committed build config). | Reword to the real mechanism: the key is **injected at build time via EAS environment variables**. Also delete a resolved-incident history block (old PR/commit references) and add a pointer to the deployment doc's EAS-variables section. | Agree — executed (PM, 2026-06-11) |
| 3.4 | **Build setup (EAS)** — notes on how mobile builds are configured. | Two sections (secrets sync, runtime-version policy) duplicate the deployment doc — duplicated text drifts. | Replace both sections with pointers to the deployment doc, **explicitly keeping** the one detail that exists nowhere else (where the Sentry upload token is stored). Everything else (NX Cloud status, WSL2 note, build quirk) stays. | Agree — executed (PM, 2026-06-11) |
| 3.5 | **LLM test harness** — how the prompt-quality test suite works. | (a) "All **10** LLM flows wired" — there are now **23**; (b) describes a file that doesn't exist; (c) paraphrases the harness README at length. | (a) Correct to 23 and point at the flow list in the code as the authoritative count; (b) delete the dead-file paragraph; (c) replace the paraphrase with a README pointer. The genuinely unique bits (snapshot trap, fixture profile IDs, CLI commands) stay. | Agree — executed (PM, 2026-06-11) |
| 3.6 | **Windows build bug (nx/expo)** — a known toolchain crash on Windows and how to work around it. | (a) Cites a helper script that was retired in the pipeline rework; (b) contains a blanket "never use `--no-verify`" ban that contradicts the now-agreed policy (a narrow, sanctioned Windows escape exists). | (a) Point at the current script that holds the workaround; (b) align the bypass wording with the agreed two-level policy (narrow deliberate use sanctioned for this exact condition, until the upstream fix lands). | Agree — executed (PM, 2026-06-11) |
| 3.7 | **Secrets how-to (Doppler)** — the operational guide for fetching secrets in dev/test. | (a) Claims a specific test fails without a live database — the test file itself says it runs without one; (b) carries resolved PR/session history. | Delete the false claim and the history. The verified how-to (project/config table, command wrappers, file pointers, macOS/Windows paths) stays. | Agree — executed (PM, 2026-06-11) |
| 3.8 | **Secrets rule (Doppler/EAS)** — the "all secrets via Doppler" rule and how mobile build secrets flow. | (a) Names a wrong command (`eas secret:create` — the real one is `eas env:create`); (b) names the wrong variable in a denylist note. | Fix the command and the variable name; route the rule text through pointers to the canonical secrets docs; keep the Windows CLI path (documented nowhere else). | Agree — executed (PM, 2026-06-11) |

---

## After you rule

1. Hand this sheet back with the ruling columns filled ("agree" / ✓ is
   enough; margin notes welcome).
2. An agent executes: the 8 edits + the Part 1 outcome (PRD fix + memory
   update **in the same change**, so the contradiction can't reopen), then
   marks the 10 confirmations as re-confirmed today.
3. Execution waits for the harness-hygiene branch to merge (same files in
   flight there); expected within days. Your rulings can land any time before
   or after that.
4. Everything is recorded on Cosmo **WI-587**, which then goes to review.
