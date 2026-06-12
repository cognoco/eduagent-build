# What happened with the new-llm branch — and what happens next

**For:** Zuzka · **From:** the program session (Vetinari) · **Date:** 2026-06-12
**Status:** strategy approved by Jorn 2026-06-12. This is the plain-English account.
*(Full technical detail: `new-llm-integration-analysis.md` in this folder, v1.4.)*

---

## 1. Why we audited the branch

Two big things have been happening in parallel on this codebase:

- **Your lane** built the `new-llm` branch — the first slice of the "Mentor-Is-The-App"
  V2 experience, plus a large batch of audit fixes.
- **The main lane** has been re-platforming identity: new account/person/consent tables
  exist in the database, and a detailed plan now describes how the app will *switch over*
  to them and then delete the old tables.

Before either side went further, we needed to know: do these two efforts collide?
So we ran a full audit of the branch — every changed file, every database change,
every document — checked against today's `main` and against the identity switchover
plan. The audit itself was then attacked four times by an independent reviewer until
nothing new came up. What follows is what survived that process.

## 2. What the branch actually contains

Two distinct layers, both of which go **live the moment the branch merges** (there is
no feature flag guarding any of it):

1. **The first stage of the V2 shell** — the "Now" feed: a new API route and service,
   a new database table (`mentor_activity_ledger`) that records mentor activity per
   profile, and the mascot/celebration components. The *rest* of the V2 plan (S1–S6)
   exists only as documents — no code yet. That matters a lot, and in a good way.

2. **About 25 modules of audit fixes**, rewritten in place: metering refund handling,
   escalation heuristics, the session-filing threshold, GDPR erasure of the BYOK
   waitlist, removal of a dead endpoint, six background-job functions, and more.

**The good news first, because it shaped the whole strategy:** the branch is clean
where it most needed to be. It doesn't touch the LLM routing core, it doesn't touch
the identity code the switchover plan cares about, the V0 navigation contract is
intact, and the V2 plan documents are admirably self-disciplined about not building
on the new identity tables before they're live. Nothing in the implemented code
conflicts *architecturally* with the identity work.

## 3. The gaps the audit found

These are the things that must be fixed **before the branch merges**. None of them
is a criticism of the feature work — most are side effects of the difficult merge
history between the branch and a fast-moving `main` (two earlier sync merges silently
dropped batches of main commits, which is also where several of these came from).

**The two most serious:**

- **The deploy gate would brick all deployments after merge.** The branch adds a
  safety script that blocks deploys if it sees "REFERENCE ONLY" migrations. Its text
  matching is too greedy: an existing, legitimate migration on main *mentions* those
  words in a comment, so after merge the script would block **every** staging and
  production deploy — including the deploy that fixes the staging KV bug the branch
  itself solves. Needs a small code fix (a structured marker plus a test), not just
  a note.

- **The new activity-ledger table has no row-level security.** Every per-profile
  table in this app gets a database-level isolation policy; the new table ships
  without one. That's both a real data-isolation gap and a guaranteed CI failure on
  main, where a coverage test enforces the rule. Needs an RLS migration before merge.

**The rest, briefly:**

- A merge on the branch accidentally **resurrected ~337 old hardcoded-English-text
  entries** that main had already burned down (the i18n ratchet baseline went 12 → 349).
  Fix: recompute the baseline properly at merge.
- A translation state file **lost its per-locale section** (~16.5k lines) that the
  translation script still reads. Restore it or re-run translate.
- **Two ADR numbering collisions** (the branch and main both minted MMT-ADR-0019),
  plus an index file pointing at the wrong documents. Renumber and fix.
- The branch's GDPR work covers *erasure* of the new ledger table but **not data
  export** (Article 15) — the export service doesn't know the table exists yet.
- **Over-the-air updates:** the merge changes native dependencies. Without a version
  bump in `app.json`, the next JS-only push to main would silently ship an OTA update
  to old binaries built against the old natives. The merge must include the bump.
- The later V2 plan documents (S4–S6) still say they're unblocked once the identity
  tables "have landed" — but landed ≠ live. They must be re-keyed to "after the
  identity flip completes", and S4 must drop a migration it schedules that the
  identity plan now owns. This prevents anyone ever starting S4 against dead tables.
- Smaller items: secrets/KV provisioning for the staging fix, a complete
  behavior-change inventory for Jorn to sign off (filing threshold, refund contract,
  endpoint removal etc. all change user-visible behavior on merge day), and one
  identity ruling document on the branch that needs to enter canon through the
  proper ratification path rather than riding the merge.

Twelve items in total. Almost all mechanical; roughly a day of focused work.

## 4. The strategy: merge new-llm first

We considered making the branch wait for the identity switchover to finish, splitting
it, or converting it incrementally. All lost to the simple option:

**Fix the twelve items on the branch, re-check it once, then merge it into main —
and run the identity switchover afterwards, on the merged codebase.**

Why this order wins:

- The identity plan re-points table references by reading the **live database
  catalog**, so your new ledger table gets picked up automatically — *if* it's
  already merged when that step runs.
- The identity work's code-side "twin" modules haven't been written yet, so they get
  written **once**, against the merged content — no rework on either side.
- Merging ends the painful rebase treadmill that has already dropped main commits
  twice, and immediately lands your staging KV fix and the bugfix batch that main
  wants now.
- Nothing in the branch needs anything from the identity work, so there's no reason
  for it to wait.

## 5. How it runs from here

1. **The twelve fixes are executed through the program pipeline** — Jorn and the
   program session orchestrate them as tracked work items, with a dedicated agent
   working on the `new-llm` branch in an isolated worktree. You don't need to drive
   this; it's mechanical. You keep a review slot on the final merge PR.
2. **One final re-check** of the branch exactly as it will merge (the fixes are new
   commits, and main keeps moving — one background-job area has already drifted),
   then Jorn approves the merge.
3. **Merge to main**, with an automated content-level check on the merge PR that
   verifies nothing from either side was silently dropped — the failure mode we've
   been bitten by twice.
4. **The identity switchover then proceeds on merged main.** Its plan gets a small
   update for your ledger table (who moves its foreign key, and that delete/export
   must cover it) and is then executed.
5. **Your V2 stages S1–S3 are not blocked by any of this** once the merge lands.
   S4–S6 wait for the identity flip, per the re-keyed plans — that's the one real
   dependency between the lanes.

## 6. Standing rules between the two lanes (agreed, both directions)

- **Never pre-assign migration numbers** in plans or docs — take the next free number
  at landing time. (This already bit both lanes once.)
- **No solo conflict-resolution merges** — any sync that hits conflicts gets the
  content-level both-parents verification before push.
- **Identity rulings go through the identity ratification path**, whichever lane
  writes them.
- During the identity plan's final switchover window (a short freeze, later this
  runway), **no merges to main from any lane** — enforced by a committed marker file
  and CI, not by memory.
- Cross-lane milestones (branch merged, switchover stages done, freeze opening/closing)
  are **explicitly announced and acknowledged**, via Jorn today and via the work
  system once its event mechanism lands.

---

**One-paragraph version:** the audit found the branch architecturally clean and
strategically easy — merge it first, before the identity switchover — but carrying
twelve concrete defects, mostly merge-history side effects, two of them serious
(a deploy-blocking script bug and a missing row-level-security policy on the new
table). The program pipeline now fixes those on the branch, re-checks it, and merges;
the identity switchover then runs on the merged codebase, and your V2 stages S1–S3
are free to proceed while S4–S6 wait for the identity flip.
