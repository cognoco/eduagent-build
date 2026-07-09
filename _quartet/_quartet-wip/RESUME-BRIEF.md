# RESUME BRIEF — Mentomate Productization orchestrator

**Halted:** 2026-07-01 ~20:00Z, weekly credits exhausted. **Nothing executing.** All lanes sent a graceful-halt directive; monitors stopped. This file is the single resume entry point — it supersedes the scattered `session-handoff.md` session-4 deltas (those remain as history).

---

## Who I am (role)
Orchestrator of 4 Cosmo workstreams (ZDX) for the Mentomate Productization program, repo `/Users/vetinari/nexus/_dev/eduagent-build`, operator = Jorn. I coordinate **operator-launched shepherd sessions** (separate runtimes) over the **Clacks** JSONL channel layer. I do NOT execute code myself — shepherds claim/refine/build; executors build; the **reviewer (Codex)** is a separate runtime, **Clacks-blind**, reachable only via Cosmo (Stage/AC/comments). Two gates: Gate-1 = green PR merge (shepherd self-merge); Gate-2 = separate reviewer close.

## Clacks channels (working-tree-only, NEVER committed)
| Lane | inbox/outbox dir | last inbox id | notes |
|---|---|---|---|
| WS-18 identity-cutover | `_wip/identity-cutover/_state/` | `ic-orch-354` (halt) | last outbox before halt = `prg06ic-416` (WI-367); HALTED line not yet read |
| WS-22/25 bug-lane | `_wip/bug-lane/_state/` | `bug-lane-orch-107` (halt) | HALTED line not yet read |
| WS-28 v2-finalization | `_quartet/working/lanes/v2-finalization/_state/` | `v2fin-orch-010` (halt) | **CONFIRMED HALTED** (read) |

**HAZARD WI-1245:** a non-ff `git` reconcile reverts the working-tree-only `_state/` files, silently dropping appended lines (real data loss seen). On resume, **Cosmo-verify** anything the channel implies before trusting it.

## Resume steps (in order)
1. **Read the 3 lane outbox tails** (LANE HALTED lines) for exact per-WI resume state. Cosmo-verify (WI-1245).
2. **Re-arm 3 filtered monitors**, seeded at then-current outbox line counts. Recipe: poll `wc -l`; on growth emit only lines whose `level` ∈ {needs-operator, needs-orchestrator, blocked}; on shrink emit a WI-1245 revert warning + reset baseline. (Old raw `tail -F` watchers flood you with `decision` lines — filter.)
   - **Monitor liveness caveat:** `TaskList` does NOT list Monitor tasks — a monitor *firing* is the only liveness signal. After a `/compact`, monitors SURVIVE (reconcile, don't blind-rearm → duplicates). A genuinely fresh session = re-arm all.
3. Execute per-lane resume actions below.

---

## Per-lane resume actions

### WS-18 identity-cutover — TOP PRIORITY = WI-779 strip
- **Plan is authoritative:** directive `ic-orch-352` + doc `_wip/identity-cutover/2026-07-01-identity-cutover-779-strip-proposal.md` (**R3, operator-APPROVED for execution**, 3 adversarial rounds, no strategy defects since R1).
- **Do:** refine WI-779 AC to the §5 stripped 7-step sequence (delete all mode-pin/drain/soak/STOP-gate/runbook/sibling-audit language). Drive the §6 WI breakdown:
  - **WI-1239** (779-E) = steps 1-2: collapse `metering.ts` `identityV2` ternary to v2-only; compiler-driven legacy-reader removal + relocate still-used shared symbols to neutral modules BEFORE deleting legacy files (NOT blind deletion).
  - **WI-1128** = step 3: FK repoint, **three families** — ~54 `.references(profiles.id)`→`person.id` (~24 files); 4 `subscriptions.id` satellites→`subscription`; accounts-target (`subscriptions.account_id`→`organization` before `accounts` drops; `profiles.account_id` drops with profiles).
  - **step 4** = author NEW post-current forward migrations from `_freeze-only/` SQL (⚠️ do NOT reuse 0117/0118/0119 — numbers collide with real journaled migrations) + convert every integration/unit seed of a legacy table to v2 in the same change-set.
  - **WI-1139/1140** (779-D duplicate pair) = step 5: delete 5 legacy defs; DEDUPE to one; gated on step 3+4.
  - **WI-869** = verify flag-on v2-only; sequence AFTER convergence (steps 3-6), not before.
- **Hard rules:** migration-immutability (new forward migrations, never edit applied); **ONE shared catalog-gated chain applied to EVERY env** so the Drizzle journal converges — NO split-by-env; catalog-gating (`to_regclass IS NOT NULL`) MANDATORY on the repoint too (frozen 0117 hard `::regclass` refs error on already-dropped staging/prod); newly-red suites after step 4 are the intended surfacing of hidden legacy deps, not regressions. Commit under WI-1246 mitigation.
- **Also (P2 background, do NOT preempt strip critical path):** WI-367 (birth-date/exact-age), hybrid RULED (`ic-orch-353`): adopt per WI-1237 reconcile-first (PRs #1680+#1724 already landed, Fixed In 4e59b0e3). Once investigator-367 returns per-caller classification → convert genuine gating callers to `calculateAgeFromParts`, leave theming callers on year-only `computeAgeBracket` (canon-correct), formally `/cosmo:refine` the AC to scope-out theming (cite AGENTS.md computeAgeBracket=theming). Surface again only on a hard-to-convert gating caller, a persistence gap, or unresolved blocker.

### WS-22/25 bug-lane
- Resume the near-done wave (WI-1067 followup / WI-1081 / WI-1094) → then **WI-1246** (P1, top) → then the review backlog.
- **WI-1246** (/commit FORK hazard) fix-shape **RULED (A+B)** by operator (`bug-lane-orch-105`): (A) client-side husky main-block (pre-commit refuses commits to main in shared checkout; pre-push refuses push to refs/heads/main; fires for every committer; `--no-verify` escape for deliberate human main work) + (B) fork fix (drop `context:fork` so /commit runs inline in caller worktree, or thread worktree path + `git -C` — **empirically verify** it pins to the worktree; harness resets cwd between bash calls). AC must include a test asserting a worktree-invoked /commit never touches shared main (red-green-revert). Root cause: `.agents/skills/commit/agents/claude.yaml:5` `context: fork` → resolves to shared main checkout; worktree path never threaded in.
- **Review backlog (6 filed, `bug-lane-orch-106`, all Stage=Reviewing awaiting Gate-2):** WI-1203, WI-1095, WI-1068, WI-1021, WI-812, WI-767 — shepherd toward reviewer close; act only on a Gate-2 bounce.
- **WI-1247** (P2, doppler cross-platform test path) after the above; leverage the closed WI-351 cross-platform Doppler resolver.
- Interim commit mitigation stays in force until WI-1246 lands (worktree explicit-refspec push after `branch != main` assert; NO /commit auto-push to shared main; builder STOPS+escalates on any main-landing; shepherd owns cleanup).

### WS-28 v2-finalization — CONFIRMED HALTED
- 9/12 closed (1168/1169/1170/1174/1122/1130/1131/1173/1172).
- **WI-1171** merged (606d80fba, Fixed In eeccd6c3b on main), Stage=Reviewing → RESUME: confirm Codex reviewer closed it (→Closed).
- **WI-1175** Ready, blockedBy=[1171] → RESUME: once 1171 Closed, dispatch a RESEARCHER for publish-readiness review of landed main; MUST carry **WI-904** as a logged deferral; ExecPath=Manual so ship/hold may be a needs-operator call.
- **WI-904** parked (Awaiting Info; on-device QA unavailable); standalone deferral, not a lane blocker.
- 5 v2-shell Reviewing items also filed here (`1207/1133/1124/1120/1118`) — Gate-2 closures when the lane reaches them.

---

## Key facts

**779 strip / env state (live-Neon verified 2026-07-01):**
- prod = fully v2-only (all 5 legacy tables dropped).
- staging = 4 identity tables dropped, but legacy `subscriptions` **orphan present (42 rows)** — dependency-free (all satellite FKs → v2 `subscription`; zero FKs → legacy). Cause: hand-applied drops drifted (prod got 0117+0118+0119; staging got 0117+0118, not the 0119 subscriptions-drop).
- dev/CI = full legacy present. **CI flag-on lane builds from the committed journal (legacy tables present) = false-assurance**; journaling the drops (step 4) makes CI test post-drop reality. Drop SQL frozen in `apps/api/drizzle/_freeze-only/` (0117 repoint / 0118 identity-drop / 0119 subscriptions-drop), deliberately out of `_journal.json`.
- Premises (operator-stated, load-bearing): **zero users; dev/staging data worth ~nothing** — reseed is cheap; recovery model = restore/reseed/re-run migrations, not user-preserving rollback.

**Machinery WIs (all captured, WS-25 unless noted):**
- **WI-1245** — `_state` churn on non-ff reconcile (WS-23/churn). The channel-revert hazard.
- **WI-1246** — /commit fork hazard (P1, WS-25). Fix-shape ruled A+B (above).
- **WI-1247** — doppler Windows-path hardcode breaks macOS/Linux test harness (P2, WS-25).
- **WI-1250** — drop staging orphan `subscriptions` (P3, WS-18, related→WI-779). **Tracking-only**; executed by 779 strip step-4 journaled catalog-gated migration, NOT a manual DROP (a hand-drop is the exact drift that caused the divergence). Closes when step 4 drops it on staging.

## Open operator decision (only one)
- **WI-752** — re-home the ADR-governance work package, or park it. (No action while shut down.)

## Standing hazards
- **WI-1245** channel-revert — Cosmo-verify channel state on resume.
- **WI-1246** commit-fork — mitigation in force until fixed; never let an autonomous builder auto-push /commit from a worktree.
- **Monitor liveness** not checkable via TaskList — firing is the only signal.
