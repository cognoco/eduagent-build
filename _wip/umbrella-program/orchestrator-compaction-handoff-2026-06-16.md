# PRG-06 Orchestrator — Compaction Handoff (2026-06-16 ~07:45Z)

> I am the **orchestrator** of **PRG-06 "Identity Cutover" (WS-18)**, coordinating the Quartet (orchestrator=me, shepherd, executor pool, reviewer) toward the operator-only **#8 flag-flip gate**. Operator goal: push autonomously to #8; minor compromises OK if documented. This is a clean compaction point — no half-finished work; Neon provisioning just landed.

## ⚠️ READ FIRST — Cosmo is the only durable truth; the file channel is unreliable
- The shared checkout (`_dev/eduagent-build`) has been **resync-reset** during this session, wiping the inbox/outbox/handoff and a local-only memory file. **Trust COSMO (Notion), not working-tree files.** Re-pull WS-18 at session start.
- Anything load-bearing must be **pushed to origin/main** or written to **Cosmo** — never left as an uncommitted working-tree file. (This handoff is committed+pushed for that reason.)

## ⚡ RULING 2026-06-16 08:07Z — Option B (billing carve) [operator-agreed]
exec-586 enumeration found the dropped-table reader surface far larger than R1/R2/dashboard — incl. the billing/quota/subscriptions cluster (subscriptions is 1 of the **5** legacy identity tables; cutover-plan line 189). Ruled **B (sequence, don't de-scope)**:
- **WI-586 = 4 identity tables ONLY** (accounts/profiles/consent_states/family_links). Migration **0118 drops FOUR, not five** — `subscriptions` stays. Close-gate (c) = full flag-on `api:test:integration` GREEN **minus** billing/quota/subscription suites (those reds tracked to 805, NOT 586 blockers).
- **WI-805** (CREATED, Backlog/Auto, Blocked-by 586) = CUT-B billing fast-follow: subscriptions drop (split migration) + ~18 billing/quota reader sweep + `account-repository.subscriptions→v2` repoint + `resetExpiredQuotaCyclesV2` cron wiring + quota-FK rehome. **Post-flip, before #11.**
- **FLIP-CRITICAL exception (non-deferrable):** any class-(c) billing reader reading legacy `subscriptions` under flag-on serves STALE payment data at #8 → gate THAT subset to the v2 `subscription` helper BEFORE #8. v2 helpers already exist (`account-repository.ts` L170-212, WI-693) → caller-side wiring, not new infra.
- Record: Cosmo WI-586 comment + WI-805 + channel `ic-orch-049`. Awaiting shepherd's a/b/c bucket of the ~18 billing readers.

## First actions on resume
1. Re-pull WS-18 from Cosmo (query below). Verify monitor `b1fprdcll` (Cosmo Stage/State) is live; re-arm if dead.
2. Read the latest comments on WI-586 (the live AC + my rulings live there).
3. Comms: EXTREMELY concise, PM/architect register (operator's standing instruction).

## IDs / channel
- data_source `36fd1119-9955-4684-8bfe-deb145e6a21f`; WS-18 page `3808bce9-1f7c-81a2-9ea1-ee924aeaa0a8`; WI-586 page `37b8bce9-1f7c-8166-b539-eb1a69ebf0fe`; Project rel `3658bce9-1f7c-8128-9f9b-fa7fcf75a13b`. Notion-Version `2025-09-03`; `NOTION_TOKEN` in env. Repo `cognoco/eduagent-build`.
- WS-18 query: `POST /v1/data_sources/<ds>/query` filter Workstream relation contains WS-18 + Stage != Closed (`dangerouslyDisableSandbox`).
- Inbox (I write) `_wip/identity-cutover/_state/inbox.jsonl` (last durable ~ic-orch-048); outbox (shepherd, read-only). Both ephemeral — Cosmo wins.

## Lane state (Cosmo, ~07:45Z)
- **Closed:** WP-1..9, 780, 784, 785, 786, 788–792, 795–799, 802, **803** (folded as **Duplicate** into 586 — see below).
- **WI-586 = ACTIVE, unblocked, Executing** (claimed `claude-code:WI-586:ramtop`, branch `WI-586`). The single live deliverable. Scope (from 586 AC + my addendum comment):
  - (a) commit **m-repoint** + (b) **M-DROP** migrations — committed, ordered rehome-before-drop, tested vs a FRESH committed-migration DB (NOT staging).
  - **R1/R2 reader sweep** (folded from 803): `nudge.ts listUnreadNudges` still `.innerJoin(profiles)` ~L230 (v2 branch); `profile.ts updateProfileAppContext` reads `profiles` ~L294/L318 + `consent_states` (getConsentStatus ~L303/L354) **unconditionally** — both M-DROP'd; need v2/person + consent-v2 reads. (family_links twins already delivered on origin/main, ex-803.)
  - (c) **CLOSE GATE / real drop-safety proof:** full `api:test:integration`, `IDENTITY_V2_ENABLED=true`, against a **committed-migrations-only DB incl. M-DROP**, exercising nudges + app-context + broad parent/child routes asserting no 500. (Strictly stronger than the retired staging route-smoke.)
  - (d) **staging rebuild from committed migrations + parity** (restores RLS by construction; folds in WI-794 verify).
- **Backlog / post-cutover:** 779 (flag/legacy removal), 794 (RLS verify, folds into 586's d), 782 (parked), 800/801 (test-infra, OFF the hard path).

## Gate delegation — RE-AFFIRMED + durable (memory `project_586_gate_delegation.md` + Cosmo 586 comments + plan §4)
- **#4 (window entry) + #6 (STOP-1, pre-reseed ≈ §4 step-3) = MINE** under conditions: staging rehearsal GREEN + parity EXACT; abort-to-operator on deviation; notify operator at each; **Neon branch snapshot before disposal**.
- **#8 (flip) + #11 (M-DROP) = OPERATOR-ONLY.** Any STOP not explicitly delegated (e.g. §4 step-6 M-REPOINT) defaults to operator.

## ✅ Neon provisioning — DONE this session (the #4/#6 abort-net prereq)
- `neonctl` installed + authed on Ramtop as `jorn.jorgensen@zwizzly.com` (OAuth creds in `~/.config/neonctl/`, **no API key** — operator chose auth method, broad-admin). Write access verified end-to-end (create+delete branch test off `production`).
- **Snapshot target:** project **`lingering-violet-30592106`** (eu-central-1); prod branch **`production`** = `br-green-pond-agpzmrwx`; staging = `br-delicate-star-agpvtzx3`; dev archived. ONE project, per-env BRANCHES (not per-env projects).
- Command: `neonctl branches create --project-id lingering-violet-30592106 --parent production --name pre-drop-<date>` (use `--parent staging` for the staging rehearsal).

## Shared-checkout note
- Resynced clean this session (HEAD==origin/main). The divergence root (WI-379/388 `/commit`-fork wrong-worktree bug) is **CLOSED + fixed** (plugin CORE `zdx-core` 1.0.1 pins `git -C`); the actual divergence cause was sessions checkpointing `_wip/` state as **unpushed** commits on main. **Do NOT commit coordination state to main** — push it or use Cosmo. Commit own-work scope only; never `git add -A`.

## Critical path to #8
586 code deliverable (autonomous via shepherd/executors: migrations + R1/R2 sweep + close-gate (c) green — all CI/ephemeral-DB, no staging touch) → **(d) staging rebuild + parity** (first staging-touching step; my territory) → **rehearsal** (#4 entry mine; #6 STOP-1 mine WITH the Neon snapshot) → **#8 flip (OPERATOR)** → ~24h soak → **#11 M-DROP (OPERATOR)** → 779 flag removal ∥ 794 RLS verify.

## Open operator items
- **None blocking.** Gate delegation re-affirmed; Neon prereq satisfied. Lane is autonomous on 586's code. Next operator gate is **#8 flip**, hours+ out (behind 586 code-green + staging rebuild + rehearsal).

## Recurring discipline (this session's lessons)
- **Verify before asserting a blocker / before sending the operator on a task.** Caught ~6 glance-errors this session (incl. wrongly declaring "no Neon access" before running the org-scoped list; the reviewer's 803 reject was VALID and exposed my own AC mis-scope). Pull the actual artifact/config/origin-main first.
- Reviewer runs in a separate origin/main-pinned clone (healthy). Close only via reviewer + QA; orchestrator may triage-fold (Duplicate) with documentation.
