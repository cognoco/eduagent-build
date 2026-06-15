# PRG-14 · Agent Instructions — execution tracker

> **THE entry point for this workstream.** Shepherd-owned. Umbrella row:
> `_wip/umbrella-program/program-roster.md` PRG-14. Full finding text:
> `docs/audit/2026-05-29-full-audit/L-gap-delta.md` (label `agent-instructions`).

**Activated:** 2026-06-14 (primed-then-sliced — first run of the `/cosmo:prime` standby
pattern). **Operator:** Jorn · **Cosmo Workstream:** "Agent Instructions"
(`WS-17`, `37f8bce9-1f7c-811d-b22f-e5d97d4b1951`). **Status:** ✅ GRADUATED 2026-06-14 — all 6 WIs Closed/Done.

## 1. Charter (one paragraph)
Clear the live `agent-instructions` audit findings — agent-facing instruction correctness:
trigger-only skill descriptions, a hook referencing a non-existent skill, a `sync-skills`
reverse-orphan blind spot, a stale AGENTS.md citation, two CI-workflow defects (a latent
injection sink + an always-green required smoke gate), and three repo-local `tech/*` skills to
**reduce-and-extend** (schemas trust-boundary discipline, DB scoped-access discipline, GHA
repo-context). **9 live findings; 5 moot** (F-035/037/038/044/045 — see §3). PRG-03 B4
(AGENTS/CLAUDE converge, WI-386) is **done**, so skill-building is unblocked.

## 2. Unit map (all `Stage=Ready`, `Execution Path=Assisted`, parallel-safe — no `Blocked-by`)

| WI | Name | Pri | Findings |
|---|---|---|---|
| **WI-743** | CI hardening: drop `e2e-ci.yml` dead injection branch + fix `e2e-web.yml` always-green smoke gate | **P1** | F-151, F-157 |
| **WI-741** | Skill-description hygiene (`commit`, `worktree-setup`) + `scope-keyword-check` hook skill-ref | P2 | F-039, F-040, F-042 |
| **WI-742** | `sync-skills` orphan guard + dispose orphan + AGENTS.md cite fix | P2 | F-046, F-041 |
| **WI-744** | Build `tech-eduagent-schemas` skill (reduce-and-extend vs `tech/zod`) | P2 | F-113 |
| **WI-745** | Build `tech-eduagent-db` skill (reduce-and-extend vs `tech/drizzle-atomicity` + `neon-postgres`) | P2 | F-114 |
| **WI-746** | Extend `tech/gha-hardening` with repo-specific context | P2 | F-116 |

Shepherd parallelizes freely. **WI-743 (P1, security/CI) first.** WI-744/745/746 are skill-content
authoring — **DoD carries a human-review-of-content gate** (skill-building is human-led per charter);
the shepherd may surface via the channel to relax it.

## 3. Slice-time decisions (2026-06-14)
- **Live scan: 9 LIVE / 5 MOOT.** Moot (no work — already resolved): F-035 (Logfire key remediated
  2026-06-09), F-037 + F-045 (CLAUDE.md now a 5-line pointer, WI-386), F-038 (code-review / thermo
  skills removed), F-044 (forbidden commit skills + the prohibition both gone).
- **PRG-03 boundary (ratified 2026-06-10):** PRG-03 owns F-037/F-045 (both now moot); PRG-14 owns the
  rest. **Crisp rule:** PRG-14 edits `.agents/skills/*/SKILL.md` descriptions, `scripts/sync-skills.mjs`,
  `.claude/hooks/scope-keyword-check.sh`, and a **line-level** AGENTS.md §Profile-Shapes cite (F-041) —
  it does **not** restructure AGENTS.md content (PRG-03/B5). Coordinate: if PRG-03 B5 (untracked)
  restructures `.claude/` skills/hooks, it must not land while WI-741/742 are in-flight.
- **Channel-routed operator decisions (raise as `needs-operator`):** (1) the
  `.claude/skills/my/e2e-infra.md` orphan — DELETE (default) vs PROMOTE (WI-742); (2) the skill-content
  review gate for WI-744/745/746 — keep human-review-before-merge (default) vs relax.
- **F-043** (`.deepsec/` SETUP.md injection) — stays **deferred** (L-gap-delta `deferred`, no
  `agent-instructions` label); out of PRG-14 scope unless the operator re-scopes.

## 4. How to run it (process in the protocols — lane-specific only)
- `_wip/identity-foundation/shepherd-protocol.md` — shepherd scaffold (incl. the Progress channel).
- `_wip/identity-foundation/executor-protocol.md` (+ `-example`) — the executor scaffold.
- Reviewer: the separate reviewer session covers WS-17 (primed at activation).
- Progress channel: `_wip/agent-instructions/_state/{outbox,inbox}.jsonl`.

## 5. Execution state
- 2026-06-14 — **Primed (Activating).** WS-17 + folder + mailboxes + stub tracker; shepherd standby +
  reviewer monitor dispatched; shepherd acked standby (`prg14-000`).
- 2026-06-14 — **Sliced + released.** 6 WIs (WI-741…746) created `Ready` from the scoping
  investigation; tracker populated; WS-17 `Activating → Open`; **GO directive written to the lane
  inbox** to release the standing shepherd. Sequencing: WI-743 (P1) first, the rest parallel;
  WI-744/745/746 human-review-gated.
- 2026-06-14 — **Shepherd GO-acted.** Raised both operator decisions to the outbox before acting:
  `prg14-001` (WI-742 orphan DELETE-vs-PROMOTE) and `prg14-002` (WI-744/745/746 review gate; default =
  hold merge for human content review). Dispatched 5 Sonnet background executors: **WI-743 (P1)** +
  **WI-741** (clean, non-gated), then **WI-744/745/746** (skill authoring, merge-held). **WI-742 held**
  pending ruling `prg14-001`. Stood up own WS-17 Stage verdict monitor (45s Notion-API poll) + inbox
  watcher. Confirmed claims live (743/741/744 → Executing within seconds). Awaiting executor green-PR
  reports and the orphan ruling.
- 2026-06-14 — **All 5 PRs opened + CI-settled; WI-743 landed.** PRs: WI-743 #1172, WI-741 #1171,
  WI-744 #1174, WI-745 #1170, WI-746 #1173 — all required checks green. **WI-743 (P1) MERGED**
  (squash `bf569d725`) → Stage=Reviewing, after a 2-round rework: Codex flagged a P1 (the new gate
  passed the required check without a real smoke); I first pushed for a hard gate, then **reversed
  (`prg14-004`)** on evidence that the staging smoke can't run in CI (`DOPPLER_TOKEN_STG` unprovisioned
  → seed 403/auth timeout) — implemented the WI's AC ("real smoke optional-only"): honest pass-through
  required check + advisory non-required `run-smoke`. Codex P1 re-disposed REJECT with rationale.
  **Blocker `prg14-003`:** docs-only PRs (WI-741/744/745/746) can't merge — `ci.yml` is path-ignored
  for `**.md`/`.claude/**`, so the required `main` check never reports → BLOCKED; escalated with a
  recommended fix (new WI for the trigger-drift, or operator admin-merge). WI-742 still held on
  `prg14-001`. Open rulings: `prg14-001` (orphan), `prg14-002` (skill review gate), `prg14-003`
  (docs-PR block). WI-743 awaiting separate reviewer's verdict (monitor armed).
- 2026-06-14 — **Orchestrator rulings landed + 2 WIs CLOSED.** Rulings (orchestrator while Jorn away
  ~2h, overridable): `prg14-001` → orphan **PROMOTE** (released WI-742); `prg14-002` → **KEEP**
  human-review for WI-744/745/746 (default ratified, merge-held); `prg14-004`/`prg14-in-004` → docs-PR
  `main`-check fix is **operator-owned** — HOLD WI-741/744/745/746 merges, do NOT touch branch
  protection/`ci.yml`. **WI-743 CLOSED** (Done) after reviewer bounce → added durable F-151/F-157
  regression guard (`scripts/e2e-ci-injection-and-smoke-gate.test.ts`, 10 tests) + red-green-revert
  evidence + 2 Codex-P2 guard hardenings; landed `f00473e22`. **WI-742 CLOSED** (Done): `--report-orphans`
  guard (namespace-descent + SKIP_SKILLS, 11 tests), orphan PROMOTED vs `/e2e`, F-041 symbol cite;
  landed `388b10dba`. **Lane state: 2/6 Closed (743, 742); 4/6 (741/744/745/746) green PRs blocked on
  Jorn** — `prg14-003` (docs-PR `main`-check fix) unblocks all 4; WI-744/745/746 also need Jorn's
  skill-content review (`prg14-002`). No autonomous work remains; inbox watcher armed for Jorn's return.
- 2026-06-14 — **✅ LANE GRADUATED — 6/6 Closed.** Operator (`prg14-in-005`) landed the gate fix
  (`d790e04eb` — `ci.yml` now runs on docs/`.claude` PRs so the required `main` check reports) and
  CLEARED the `prg14-002` content gate ("merge skills as-is, no rework; lean-pointer rework → Stream 2").
  `gh pr update-branch` on the 4 docs PRs re-triggered CI → all green → merged: WI-744 `121371b3`,
  WI-746 `a35df5b3`, WI-745 `afb0ddd7`, WI-741 `2d76ed08` (WI-743 `f00473e22`, WI-742 `388b10dba`
  already merged). All finalized via `/cosmo:execute complete`; reviewer Closed all 6 (no bounce on the
  deferred content P2s — reviewer honored approve-as-is/Stream-2 deferral). **Carry-forwards
  (`prg14-008`/`prg14-009`):** Stream 2 skill rework should also fix 3 deferred Codex P2 content items
  (tech-eduagent-db false 'lint-enforced' claim [security-adjacent] + TOCTOU example; tech/gha-hardening
  eval-live inventory); WI-743 missing Project relation (cosmo hygiene); `.worktrees/WI-*` prunable.
