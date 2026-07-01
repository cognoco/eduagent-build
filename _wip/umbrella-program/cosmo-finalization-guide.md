# Cosmo WI Finalization Guide

> **Purpose.** Consolidated ZDX/Cosmo **autonomous-review finalization** knowledge, drained from three
> `.claude/memory/` files on **2026-06-20** into one place. This is the **reviewer leg of the Quartet**
> (cross-ref `_quartet/_quartet-wip/quartet-findings.md` F28): ZDX-lifecycle knowledge used by *any* agent, not
> Quartet-only. Productization should fold this into the **cosmo / zdx skill docs**, not a `_quartet/`
> protocol file.
>
> Operational runbook (live-tracking), NOT frozen protocol. **FREEZE-safe.**
>
> **Provenance** (all `[drained→deleted]` 2026-06-20): `project_cosmo_shepherd_finalization`,
> `reference_cosmo_execute_complete_finalize`, `feedback_cosmo_reviewer_reads_objective_for_ci`.
> Related memories left intact: `reference_claude_review_verdict_location` (GitHub claude-review verdict,
> not Cosmo), `project_cosmo_wi_project_relation_misfiling`, `project_prg14_agent_instructions_lane`
> (allowed-red CI precedent).

---

## 1. The finalize path: `execute complete` (current) vs `replace_content` (superseded workaround)

**Resolution of a stale contradiction** (the two source memories disagreed; this is the settled answer):

- **`cosmo:execute complete` IS the canonical finalize path** when its `completion-summary.md` is
  **parser-conformant** (§2). Proven clean at the PRG-17 r2 land, 2026-06-19 (WI-842/843/844/845/846).
  AGENTS.md mandates it: *"always finalize via complete / never hand-edit Stage."*
- The older claim *"`execute complete` v0.1.0 is unusable → use `replace_content` + property PATCH"* was
  the **v0.1.0 workaround** (complete then APPENDED duplicate, non-rendered LITERAL summaries the LLM
  reviewer rejected). It is **superseded** — drop the "unusable" framing.
- `replace_content` + a Notion property PATCH survives ONLY as a documented autonomous-loop exception for
  the case where `complete` structurally deadlocks (§8). Where the mandate forbids `replace_content`,
  that deadlock escalates to an operator force-close — do NOT hand-roll around it.

`execute complete <artifacts-dir> success` finalizes a claimed WI → **Stage=Reviewing**. `ci-status`:
`success` for normal; `escalated` → Awaiting Info. `Fixed In` derives from worktree **HEAD** (cite the
landed / ancestor-of-main SHA; `git checkout --detach <sha>` if you need a specific one).

---

## 2. Completion-summary format (parser-conformant)

`complete` REFUSES unless `<artifacts-dir>/completion-summary.md` exists AND contains all **4 lifecycle
sections**, each as **`Title:`** on **one line** — regex `/Title[^:\n]*:/i` in cosmo `skills/review/dod.ts`.
`## Title` headers WITHOUT a colon **FAIL**.

Use the bold-inline form:

```
**What was done:** …
**What changed:** …
**Verification:** …
**Caveats / Follow-ups:** …
```

- **Caveats / Follow-ups MUST be a single line.** `dod.5.summary_sections` rule-4 regex is
  `/Caveats[^:\n]*Follow-?ups[^:\n]*:/i` — both words on the SAME line. The split two-line form
  (`**Caveats:**` then `**Follow-ups:**`) FAILS because the colon right after "Caveats" breaks the
  same-line match. Rules 1-3 (What was done / changed / Verification) pass fine as bold-inline.
  (Confirmed live: WI-586 bounce 2026-06-17; parser source = `dod.ts` SECTIONS array, v0.6.0.)

- **Parser-clean PROSE** (the `cosmo:qa` verifier extracts "claims" from the whole page body — these
  tokens trip false failures; WI-825):
  - **(a)** full repo-relative paths in backticks ONLY — a bare `deletion-v2.ts` is sought at repo ROOT
    and FAILS; the full `apps/api/src/.../deletion-v2.ts` verifies.
  - **(b)** NO hex tokens in prose — a profile UUID `019edfdc…` is read as a "missing commit".
  - **(c)** NO standalone test/pass counts — "413 tests" triggers a test re-run.
  - **(d)** NO `/route` tokens — `/ready` is read as a missing file.

---

## 3. `Fixed In`

`complete` v0.1.0 never writes `Fixed In`, but `dod.7.fixed_in` **hard-requires** a non-empty value and
mechanical-bounces on empty (Reviewing→Executing within ~1 min). The check tests **presence, not
SHA-shape**.

- **Code WIs:** the landed commit SHA (re-derives from worktree HEAD on `complete`).
- **No-code / operational WIs** (decision/ops satisfied without a PR — e.g. a staging reseed during a
  rehearsal; WI-814 bounce 2026-06-18): set `Fixed In` to a **descriptive landed-artifact reference**,
  e.g. `Satisfied by Stage-2 staging-rehearsal reseed — evidence _wip/.../manifest.md; staging branch
  br-…`. If the reviewer later bounces on a SHA-*format* or a manual `dod.4` (landed-on-base) judgment,
  **escalate to the orchestrator** for the lighter superseded/done path rather than fabricating a commit.

---

## 4. Re-finalize after a Gate-2 bounce

A bounced item sits at **Stage=Executing** (so `fetch` is blocked — it requires Stage=Ready), but the
original `<artifacts-dir>/workitem.json` survives. Re-finalize the same way:

```
git worktree add --detach <path> <fixed-in-sha>   # check out at the precise Fixed-In SHA
cosmo:execute complete <artifacts-dir> success     # Fixed In re-derives from HEAD; no active claim needed
```

- **Watcher state-file skip (WS-18 automated reviewer, 2026-06-17):** on a REWORK bounce the watcher
  records `${WI}|${Resolved}` in its STATE file and **SKIPS that exact key forever** ("already processed
  transition"). To force a fresh review after a re-finalize you MUST change the key — **bump the
  `Resolved` date** (e.g. 06-16→06-17). Re-setting Stage=Reviewing with the same `Resolved` is silently
  skipped.
- The watcher whitelists known env false-fails in its QA pass (e.g. a missing `C:/Tools/doppler.exe`
  test re-run), so those don't re-bounce — only a real mechanical fail or a non-whitelisted QA failure
  does. (Caveat: the whitelist did NOT cover the `C:/Tools/doppler.exe`-on-Mac path in WI-825 — that
  Windows-path-on-Mac runner is a fleet-level reviewer bug.)
- **Re-finalize CAN pass on the first try** when the correction is sound: WI-844 (2026-06-19) closed on
  the FIRST re-finalize after a corrected `Fixed In` + a primary-source prose rebuttal of an INVALID
  "required CI red" claim (Flag-ON is the ic-116 allowed-red lane, NOT a branch-protection required
  context) — put the rebuttal in the completion summary AND an in-thread Cosmo comment; the feared
  re-bounce did not occur.

---

## 5. Closure-verification reads the WI OBJECTIVE / NAME

`dod.closure_verification` is the reviewer's **judgment that the WI's *objective* is met** — it derives
the objective from the **WI NAME + AC**, then pulls the **live GitHub check-run** to verify. It does
closure-verification against the stated objective/name, **not** just the AC checklist or `Fixed In`. If
the name/objective says "drive X CI lane green," it pulls that lane's live check-run and fails the close
if it's red — **even when the lane is `continue-on-error: true`** (advisory/non-required) and the
required-4 are green. The reviewer has **no out-of-band knowledge** of the allowed-red policy — it must
be cited IN the WI.

**Why it bites (WI-808: 3 bounces then PASS, 2026-06-18):**
1. AC-scope mismatch → narrow the AC.
2. After an operator-authorized re-scope, the **stale NAME** (e.g. "drive flag-on integration suite
   green") kept the reviewer reading the OLD objective and pulling the advisory-red Flag-ON check-run →
   bounce.

**Fix when re-scoping a WI (proven, ic-152/153):**
- **(1) RENAME the WI to its delivered scope** (honest hygiene, not gate-gaming — the moved objective is
  factually stale) **+ (2) restate the AC/objective** to what actually landed **+** carve the moved
  objective to a follow-up WI (purge any "drive lane green" framing).
- For an **allowed-red CI lane**, ALSO post a close-note **comment** citing the policy **by name**:
  `docs/change-classes.md` §"Flag-ON Integration Lane (advisory / WI-789)" (commit `e87bd3aef`:
  `ci.yml` `continue-on-error: true`; "NOT a Gate-2 close-blocker for identity WIs"; names the baseline
  suites) + the **ic-116** standing rule + the **WI-811 Gate-2 precedent**. Assert the lane red is within
  the known baseline (not a regression); the WI closes on the **required-4 green + the carve**, NOT the
  advisory lane.
- **HARD STOP:** if it still bounces after rename + citation, the reviewer structurally cannot close an
  identity WI while its lane is red → **STOP, escalate to the orchestrator for an operator-authorized
  manual close**. An agent-asserted / manual close is otherwise forbidden by AGENTS.md ("close only via
  review + QA"); that bypass is operator-authorization-only.

---

## 6. Notion / Cosmo REST specifics

- **`Stage` is a `select`** (not `status`): PATCH `{"Stage":{"select":{"name":"Reviewing"}}}`.
- **Comments** via REST `POST /v1/comments {parent:{page_id}, rich_text:[…]}` (the token has the
  insert-comment capability).
- **`Acceptance Criteria` rich_text is hard-capped at 2000 chars/block** — `capture.ts` does NOT
  auto-chunk; trim or split.
- The property PATCH that mirrors a `complete` write (only for the §1 exception path): `Stage=Reviewing`,
  `State=Active`, `Resolved=now`, clear the four claim props, PLUS `Fixed In`.

---

## 7. Reviewer timing & the monitor caveat

The autonomous reviewer **bounces within ~1 min of finalize**. Verify the WI's Stage via a **DIRECT page
read** shortly after finalize — the WS-18 DB-query monitor **lags** the authoritative page state and
**replays stale transitions**; do not trust it as the bounce trigger. (This is the Cosmo-side instance of
the differ-baseline monitor blind spot — see `_quartet/clacks/monitor-hygiene.md`.)

Pre-poll self-check: `bun <cosmo>/skills/review/review.ts --check WI-NN` → `mechanicalOk:true` BEFORE the
reviewer next polls. (Reviewing items are reviewed; Executing ones are skipped — so edit the body while
Executing, or race-safely.)

---

## 8. The append / cumulative-parse DEADLOCK → operator force-close

When the mandate FORBIDS `replace_content` (AGENTS.md "always finalize via complete / never hand-edit
Stage"), `execute complete`'s APPEND behavior can create a **hard deadlock** (WI-825 PRG-18, 3 bounces →
operator force-close, 2026-06-19):

- `cosmo:qa` extracts "claims" from the **WHOLE page body**. Because `complete` APPENDS, a clean
  re-finalize can **never clear** trip-wire tokens written by the FIRST `complete` — the stale summary
  stays, QA keeps re-reading it (verified: the clean full-path summary landed AND the old
  bare-name/UUID/count tokens still failed in the *same* `qa.json`).
- **Defense = make the FIRST `completion-summary.md` parser-clean** (§2 prose rules). There is no clean
  recovery once a dirty first-complete has appended.
- **At the 3rd bounce: STOP. No whack-a-mole.** Escalate for an **operator force-close** (when the work
  is correct + merged; spin real gaps to a separate WI).

---

## 9. Pickup gotchas (Backlog/Ready promotion)

Sliced items can land at `Stage=Backlog` (not Ready) with the wrong `Altitude`. `refine.ts` **CANNOT
promote a childless `WP`** (its `wp.children` / `wp.brief` gates fire unconditionally). The sanctioned
Captured→Backlog writer is `triage.ts --disposition backlog`, then `refine.ts --to-ready` (set
`executionPath` or it stays Backlog). Canonical narrative:
`_wip/new-llm-integration/execution-tracker.md` §4.
