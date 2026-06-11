# L10n & A11y Mobile — Execution Tracker

**Stream:** l10n-a11y (umbrella roster **PRG-12**) · **Activity:** mobile localization + accessibility clean-out (agent-heavy sweep)
**Last updated:** 2026-06-11 (shepherd session — review loop wired, WI-621/622 Ready) · **Owner:** Jorn (+ shepherd session agents)

> **This is the durable entry point for this activity.** Point a fresh session here:
> it should be enough to know *what this is*, *where the detail lives*, and *where to
> pick up*. It is **not** a second source of truth — see §2.

---

## 1. Charter

**What this activity is.** Resolve all 34 `l10n-a11y-mobile` findings from the
2026-05-29 full audit (ratified charter: `_wip/umbrella-program/activation-planning.md`
§2 → PRG-12): route 358+ hardcoded English strings through `t()`, wire screen-reader
announcements and modal focus management, complete role annotations, migrate
pluralization to the i18n-native model, fix date/locale handling, and clear the small
mobile logic-bug batch that travels with this surface.

**Blast-radius class (ratified):** `out-of-radius` — UI/i18n/a11y layer; the identity
rewrite does not touch this surface. **Parallel-safe, anytime.** No cross-Initiative
gates; no boundary events imported.

**Supervision profile:** agent-heavy / low-supervision — this Initiative is the
program's archetype for mechanical agent-sweep work. Human attention goes to bundle
review, not per-string decisions.

**The bundle model (8 WPs, flat, no hard edges).** All units live in Cosmo under the
**L10n & A11y Mobile** Workstream. Bundles are independent file-surfaces; order below
is soft (Workstream Order), chosen so the two P1 bundles (largest user impact) land
first and overlapping surfaces (roles ↔ label-strings) land adjacently.

| # | WI | Unit | Findings absorbed | Priority |
|---|---|---|---|---|
| 1 | WI-621 | WP-L12-jsx-strings — route hardcoded JSX/auth strings through i18n | F-026, F-061, F-062, F-069, INV-1 | P1 |
| 2 | WI-622 | WP-L12-sr-announcements — announce streamed replies, quiz results, loading, toasts | F-050, F-051, F-053, F-054, F-068 | P1 |
| 3 | WI-623 | WP-L12-modal-focus-roles — modal focus trap, roles, input labels, badge semantics | F-052, F-070, F-055, F-057, F-058 | P2 |
| 4 | WI-624 | WP-L12-label-prop-strings — hardcoded accessibilityLabel / native-dialog / prop strings → `t()` | F-063, F-064, F-066 | P2 |
| 5 | WI-625 | WP-L12-pluralization — migrate 29 manual-plural sites to i18n plural model | F-065, F-071 | P2 |
| 6 | WI-626 | WP-L12-mobile-logic-bugs — small mobile logic/UX bug batch | F-123, F-160, F-161, F-165, F-168, F-172, F-175 | P2 |
| 7 | WI-627 | WP-L12-dates-locale — locale-aware date formatting + UTC/local-day fixes | F-067, F-072, F-177, F-178 | P3 |
| 8 | WI-628 | WP-L12-decorative-lowvision — hide decorative content from SR + fix 10px text | F-056, F-059, F-060 | P3 |

Coverage check: 33 F-IDs + INV-1 = 34, each absorbed exactly once. Full finding text
lives in the register (§3) — WP bodies carry the one-line gists + register pointer,
per the direct-to-WP slice rule (planning-reference §2.2).

**Slice-time decisions (recorded at activation, 2026-06-11):**

- **INV-1 is PARTIALLY RESOLVED already** — `scripts/check-i18n-jsx-literals.ts`
  (forward-only ratchet, **361-entry baseline**) exists and gates CI for JSX
  text-children. WP-1's INV-1 scope is therefore: **burn down the 361-entry baseline**
  as strings are routed through `t()` (re-run `--accept` only for genuinely
  non-translatable copy, justified per commit), NOT building a guard. Extending the
  guard to JSX *attribute* literals stays open scope (see AGENTS.md — needs a per-prop
  allow/deny model) and is **not** in WP-1; it rides F-063/F-066 review in WP-4 as a
  candidate follow-up capture.
- **F-123 stays in PRG-12** (charter open question 2): it is a stale-instance removal
  (dormant web ChatShell voice controls) — scope in WP-6 is **remove the dead
  instance**, not fix it.
- **F-172 stays in PRG-12** (charter open question 3): yes it is a logic bug, not
  l10n/a11y, but it is a small single-screen mobile fix and PRG-11 activates much
  later (post-G4 + moot scan). Moving it would trade a trivial fix for a long delay.
- **F-163 EXCLUDED**: in-IF-scope, already delivered and Closed via WI-584 (PR #874).
- **F-026 INCLUDED** in WP-1: it carries the `l10n-a11y-mobile` label in the register
  though it sits outside the charter's representative list.
- **Priority derivation rule** (charter encodes severity, not priority): WP priority =
  highest constituent audit severity — C→P1, H→P2, M/L→P3. Logic-bug batch held at P2
  (contains a HIGH_BUG, F-123).

**The bar ("done").** All 34 findings resolved or explicitly re-dispositioned at
review; i18n checkers green (`check-i18n-orphan-keys`, `check-i18n-jsx-literals` with a
materially smaller baseline); no new hardcoded user-visible copy introduced; every WP
Closed via `/cosmo:review`.

---

## 2. How to use this doc

- **Cosmo is authoritative for live per-WI state** (Stage / State / claims /
  dependencies). This file carries the **charter, pointers, bundle map, and coarse
  status** only — refresh at checkpoints; never treat its status column as the system
  of record.
- **Claim before you execute.** The lock is the live Cosmo Claim props, not this file.
  Repo AGENTS.md Cosmo operating rules apply in full: claim → execute → complete →
  Reviewing; never self-close; close only via `/cosmo:review` (+ `/cosmo:qa` evidence).
- **Worktrees:** every executor works in `.worktrees/<WI-NN>/` via the repo
  worktree-setup skill (`.agents/skills/worktree-setup/SKILL.md`) — never Claude Code's
  built-in EnterWorktree.
- **i18n mechanics:** before touching strings, read AGENTS.md §Languages + §UI strings
  hygiene. New keys go in `en.json` in the same PR; run `pnpm translate`; dynamic-key
  patterns go through `scripts/i18n-keep.ts` with a real `file:line` cite.
- **Status vocabulary (coarse):** `backlog` · `ready` · `in-progress` · `review` · `done`.

### Operating patterns inherited from the IF dogfood (apply here)

- **WP DoR bridge (top-down-sliced WPs).** Top-down WPs fail the bottom-up WP DoR
  mechanically, and the review gate (`dod.wp.bulk_ready`) requires ≥1 child at close.
  Per the IF operator ruling 2026-06-10 (see IF tracker §2), the shepherd applies the
  bridge per WP without asking: transcribe the bundle brief into the page body, capture
  2 thin provenance children (stubs — "absorbed provenance, lifecycle rides the
  parent"), set `Sub-item`, then `refine --to-ready`. *Extension of that IF-scoped
  ruling to PRG-12 assumed at activation — operator may veto.* Standing until WI-593
  (substrate DoR fix) lands.
- **Children pre-sweep at merge.** Sweep provenance children with the parent at merge
  time (validated by WI-576 — avoids the children-gate bounce at review).
- **Conditional merge authority.** Mirrors the IF ruling: a PR may be merged once its
  WI reaches `Stage=Reviewing` via `complete`, provided the merger independently
  re-verifies green (`gh pr checks` all passing, no unresolved blocker findings, diff
  shape sanity-checked). Merge ≠ close.

---

## 3. Pointers / index

| What | Where |
| --- | --- |
| **Ratified charter** (THE slice source — themes, counts, open-question dispositions) | `_wip/umbrella-program/activation-planning.md` §2 → PRG-12 |
| **Findings register** (full finding text, one row per F-ID, label `l10n-a11y-mobile`) | `docs/audit/2026-05-29-full-audit/L-gap-delta.md` |
| **Umbrella roster** (program altitude — PRG-12 row, gates, queue) | `_wip/umbrella-program/program-roster.md` |
| **Substrate operating rules** (claim/complete/review, output conventions) | repo `AGENTS.md` → "Cosmo work-item operating rules" + "Working a Cosmo Work Item" |
| **i18n ratchet** (INV-1 artifact — baseline = WP-1 burn-down list) | `scripts/check-i18n-jsx-literals.ts` + `scripts/i18n-jsx-literals-baseline.json` |
| **Cosmo Workstream** | "L10n & A11y Mobile" (Workstreams DB), all 8 WPs related |

---

## 4. Execution sequence + coarse status

Soft order = Workstream Order. No hard `Blocked-by` edges — all bundles are
independent surfaces; run serially by default, parallelize only non-overlapping
surfaces (e.g. WP-6 logic bugs alongside WP-1 strings is safe; WP-3 and WP-4 touch
overlapping component files — keep adjacent/serial).

| Order | Unit | Coarse status |
|---|---|---|
| 1 | WI-621 WP-L12-jsx-strings | in-progress — PR A #942 MERGED `684495a2c` (89 strings, 361→272); PR B #961 **MERGED** `e382a95e6` (138 strings, 272→134, clean gate). Child WI-634 swept. Group C (final, ~127 strings + 8 `--accept`) building on `WI-621-c` |
| 2 | WI-622 WP-L12-sr-announcements | **done** — PR #940 merged `ce8b10ab9`; children WI-635/636 swept; CLOSED Done by autonomous review 2026-06-11 (first WP through the PRG-12 loop, zero human touches) |
| 3 | WI-623 WP-L12-modal-focus-roles | backlog |
| 4 | WI-624 WP-L12-label-prop-strings | backlog |
| 5 | WI-625 WP-L12-pluralization | backlog |
| 6 | WI-626 WP-L12-mobile-logic-bugs | in-progress — PR #959 open, gate-held once (valid Codex CJK-matcher P2, fixed in `210569ee6`; CI re-running). NOTE: executor ran premature `complete` on the unmerged PR — shepherd restored Stage=Executing with [shepherd:hold] comment; one review run wasted. F-123 delivered as dormant-instance gating (shared live component — full removal would break focused/mobile chat); completion summary must carry the AC deviation note |
| 7 | WI-627 WP-L12-dates-locale | backlog |
| 8 | WI-628 WP-L12-decorative-lowvision | backlog |

**Sub-slice watch:** WP-1 absorbs the ~358-string aggregate (F-069) — it is the one
bundle likely to exceed PR size. Sub-slice on demand at execution (planning-reference
§2.2): split by screen-group (e.g. auth+onboarding / session+home / rest) into stacked
PRs or sibling WPs at the shepherd's call. Do not pre-slice.

---

## 5. Current position

**2026-06-11 — SHEPHERD SESSION LIVE; review loop wired; WI-621 + WI-622 Ready.**
The autonomous reviewer watcher now covers this workstream: single multi-workstream
process (`bun _wip/identity-foundation/review-watcher-v3.ts`, detached, parent=1),
watching **Identity Foundation + L10n & A11y Mobile**, trigger `Stage=Reviewing`,
60s poll, state keyed by `workstreamName::wiId`. Heartbeat log moved to
`/tmp/cosmo-watch/logs/cosmo-reviewing-watcher.log` (old per-IF log is historical);
review outputs named `<WI>.<ws-slug>.<ts>.*` under `/tmp/cosmo-watch/reviews/`.
WI-621 and WI-622 bridged (briefs in page bodies; provenance children WI-633/634
and WI-635/636; Sub-item set) and refined to `Stage=Ready`, `Execution Path=Assisted`.
**Operator go received 2026-06-11 (full autonomous mandate for the whole workstream;
hold only for genuine judgment-unresolvable issues, conservatively).** WI-621 +
WI-622 dispatched in parallel and claimed (`wi621-executor` / `wi622-executor`,
Stage=Executing). Executor briefs generate from
`_wip/l10n-a11y/executor-amendments.md` (living checklist — IF amendments inherited
+ PRG-12 i18n/a11y domain rules). Stage monitor armed on this workstream (90s,
shepherd-owned); review watcher already multi-workstream. WI-621 has a mandatory
Phase-2 sizing checkpoint before mass edits (sub-slice ruling is the shepherd's).

**Restart context (if this session dies):** the watcher survives (detached); check it
with `ps -eo pid,command | rg review-watcher` + the heartbeat log above — never start
a second one (kill the old first if extending). Stage monitor + CI watchers are
session-bound — re-arm per IF mechanics §2.1–2.2 (substitute this workstream's page id
`37c8bce9-1f7c-8169-8ce1-ddcf36b470c9`). Executor briefs: copy
`_wip/identity-foundation/executor-protocol-example.md` shape + its amendments block
(maintain a PRG-12 copy as lessons accrete).

---

## 6. Change log

- **2026-06-11 (shepherd)** — Review watcher extended to multi-workstream per the
  productization-handoff recipe: `workstreams[]` config array (IF keeps its
  WI-585/586 DoD overrides; this workstream has none), all de-dupe/running state
  keyed `workstreamName::wiId`, workstream name in logs/paths/prompts, ONE process
  for both workstreams. During the swap, found **two** duplicate watchers running
  (the documented PoC failure mode — both had double-fired WI-581's 11:56 review);
  killed both after in-flight WI-581 reviews drained (WI-581 closed Done cleanly),
  started the single replacement, verified baseline seeded both workstreams without
  firing. WI-621 + WI-622 taken through the WP DoR bridge → `Ready` (Assisted);
  provenance children WI-633/634 + WI-635/636 captured at `Captured`.
- **2026-06-11** — Created at PRG-12 activation (program session). Charter
  transcribed from ratified activation-planning §2; INV-1 pre-check run (ratchet
  exists, 361-entry baseline → scope reframed to burn-down); placement decisions
  F-123/F-172 (stay), F-163 (excluded, delivered), F-026 (included) recorded; 8-WP
  slice defined.
