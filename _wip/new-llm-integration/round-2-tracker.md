# PRG-17 (round 2) · new-llm — AUDIT & CATALOG (landing deferred)

> ## ⚠️ NON-STANDARD — NOT a workstream shepherd, and (since the 2026-06-18 pivot) NOT a lander either. Exclude from the productization corpus.
> This lane borrows the shepherd **session scaffold** (worktree discipline, channel, hold-for-operator)
> but not the shepherd **spine**. It began as a one-shot integration-runner (sync `main`→`new-llm`, land
> to `main`); on 2026-06-18 it was **re-scoped to an AUDITOR** after the landing surfaced accumulated
> base=main debt (see §9). Its job now: **test / review / audit `new-llm`, and catalog every finding as a
> Cosmo Work Item — fix NOTHING inline.** Done-signal is a **reported catalog**, not a merge and not a
> Cosmo Close. When orchestrator behaviour is analysed for productizing the shepherd (PRG-05), treat this
> as an **auditor-runner instance**, distinct from a canonical workstream shepherd.

**Status:** ACTIVE 2026-06-18 — **audit mode** (pivoted from integration-runner; landing deferred).
**Round 1 (done):** new-llm → main landed #1087 (`--no-ff` `105b39ac0`) on 2026-06-13 — see this dir's `execution-tracker.md`. Closed the 12-item reconciliation + unlocked the IF cutover (since LANDED: #8 flip + #11 drop done).
**This round:** **AUDIT, not land.** new-llm advanced past `105b39ac0` (V2-shell + LLM work + WI-819). A trial landing (PR #1232) revealed the cumulative branch carries base=main-only debt the per-WI (base=new-llm) reviews never saw. So: audit the branch for main-readiness + canon-fit, catalog the findings, and **defer the actual land to a future round** gated on the catalog clearing.

## §1 Charter — AUDITOR (fix nothing)
Test, review, and audit `new-llm`; for **every** issue found, draft a catalog entry and move on. **Fix none of them.** Output = a reported catalog → (after orchestrator routes home + ownership) Cosmo WIs. The Codex adversarial review is the **audit engine**, not a fix loop.
- **Bound the audit** (it is itself a thread to pull): one *actionable* entry per finding — title, concrete repro, one-line suggested fix, severity, suspected owner (ours-vs-Zuzka). Do NOT root-cause to the bottom of each.
- **Create no Cosmo WIs unilaterally** — report the drafted catalog to the orchestrator first; orchestrator routes WI-home + ownership, then greenlights creation.

## §2 Audit dimensions
1. **Main-readiness** — every base=main-only red on the #1232 oracle, and why (these are invisible to base=new-llm per-WI review — the GC1 red is the archetype; hunt siblings: other ratchets, i18n baselines, decision-adr, etc.).
2. **Canon-fit** — do the V2-shell + LLM deltas conform to canon (the original preliminary-sweep question)? Flag divergences.
3. **Functional smoke** — sanity of the headline changes (WI-819 lost-connection recovery; V2 nav additions).

## §3 Seed catalog (already established — hand these to the audit as starting findings)
- **GC1 base=main ratchet (the one real base=main-only red).** `apps/api`/`main` required check fails: 5 added internal `jest.mock('./…')` in `apps/mobile/src/hooks/use-navigation-contract.test.tsx` (V2-nav work). Base=new-llm per-WI review never flagged it (already in baseline there); fires only vs base=main. **Suggested fix (trivial):** Pattern-A `…jest.requireActual(…)` or `gc1-allow` w/ truthful reason (round-1 WI-695 precedent). A staged-only draft fix exists in the worktree as the artifact — NOT pushed. Severity: blocks a future land. Owner: likely ours (integration debt).
- **recaps.ts semantic — RESOLVED, not a finding.** new-llm's new `profileSessionToRecapItem`/`listProfileSessions` path already forwards `opts?.identityV2Enabled` (main's WI-821 threading). Confirmed correct in-tree; recaps.ts is `+66/-0` (zero conflict). No entry needed.
- **Flag-ON integration 500s — inherited main baseline, NOT a new-llm finding.** ic-116 discrimination (run 27772532944 @ base `c0ec04a3a`): flag-on FAIL set 48 == #1232 FAIL set 48, `comm -13` empty → zero new red. The `POST /v1/profiles` 500s are ambient post-cutover CI-pre-repoint-DB divergence on `main` itself; round-2 adds no integration test / no schema, so it inherits the baseline unchanged. Lane is `continue-on-error`. → main-side debt, separate from this audit (note it, don't own it here).

## §4 Working mode (audit)
- Worktree off `origin/new-llm` for running checks (read-mostly). **Keep the audit BASELINE = true `origin/new-llm`:** park/stash the staged GC1 edit so re-running checks still reproduces the red — never let the auditor's own draft fix mask a finding.
- **PR #1232 stays OPEN as the base=main CI oracle** — DO-NOT-MERGE / DO-NOT-CLOSE. It is the cheapest enumerator of base=main-only reds.
- **Compute all SHAs at runtime, never static** (round-1 lesson).
- **Codex adversarial review = audit engine:** when it returns, TRIAGE each finding (valid / dup / false-positive; severity; owner), catalog valid+unique ones, record false-positives as entries marked invalid+rationale so they are not re-raised. Fix none. One source among the dimensions, not the whole audit.

## §5 Rigor vs phases (supersedes the orch-003 fix framing)
The executor-protocol **RIGOR** binds — adversarial discipline, verify before asserting, no rogue inline decisions. Its **FIX/MERGE phases do NOT apply** in audit mode: no Phase-4 fix-and-re-iterate loop, no Phase-5/6 green-PR drive, no Phase-7 complete. Output is the catalog + report, not a green PR.

## §6 Done-signal (audit)
Catalog reported to the orchestrator → orchestrator routes WI-home + ownership → Cosmo WIs created. **Not** a merge, **not** a Cosmo Close. (The land is a separate future round — §7.)

## §7 The landing (DEFERRED to a future round)
Recorded for whoever runs the future land:
- `origin/main` is a **full ancestor** of `origin/new-llm` (0 behind / 44 ahead as of 2026-06-18) → the sync is a content no-op; `git merge origin/main` is already-up-to-date.
- The land is **blocked on the catalog clearing** (GC1 + any sibling base=main reds fixed on new-llm so #1232 goes green).
- Payload WIs (incl. **WI-819**, already `Closed`/`Done`, Fixed In = new-llm SHA `3a6f4e66…`) are correctly closed against new-llm; the future `--no-ff` land brings them onto main as a batch and their SHAs become ancestors of main — **no Cosmo re-close needed** (same decoupling as round 1; #1087 closed no WIs).
- Final land is **operator-go only** (`--no-ff`, like round 1).

## §8 Channel
`_wip/new-llm-integration/_state/{inbox,outbox}.jsonl`. Auditor arms an inbox Monitor at activation; appends to outbox at the four triggers. Orchestrator steers via inbox; monitors **outbox + GitHub (#1232)** — no open Cosmo WI in this round, so no Cosmo verdict monitor.

## §9 Log
- **2026-06-18 (created)** — Round-2 tracker created as an integration-runner (sync-and-land). Channel + kickoff authored.
- **2026-06-18 (triage)** — Runner verified main ⊆ new-llm (0/44), recaps.ts zero-conflict + threading correct, ic-116 flag-on = inherited baseline (48==48), GC1 = the one real base=main red; opened PR #1232.
- **2026-06-18 (PIVOT → audit)** — Operator ruled: stop inline fixing; re-scope to AUDITOR (test/review/audit + catalog WIs, fix nothing). GC1 fix halted (staged-only, nothing pushed). Landing deferred. Directives `prg17r2-orch-004` (halt + mission change), `prg17r2-orch-005` (KEEP confirmed + Codex-as-catalog-source + supersede orch-003 fix-phases). Runner acked (`prg17r2-004`). Tracker re-scoped to match.
