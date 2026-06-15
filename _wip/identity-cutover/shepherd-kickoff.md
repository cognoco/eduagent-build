# PRG-06 "Identity Cutover" — Shepherd Kickoff (PARKED — do not launch until §0 clears)

> Thin pointer-brief (planning-reference §2.6: three pointers + checkpoint duty + boundary
> events). **Operator-launched** (§2.5) — the orchestrator authored this; Jorn spawns the
> shepherd session. Briefs are pointers, never pasted content — read the pointers.

## 0. Launch precondition (HARD GATE)
**Do not start until `MMT-ADR-0020/0021/0022` cleanup is operator-confirmed complete.** Those
three were reverse-engineered from the S0–S6 plans and are being re-vetted in a separate
session. Once Jorn confirms cleanup done, they are **trusted canon** and you operate normally.

## 1. The three pointers
1. **Tracker (durable state):** `_wip/identity-cutover/execution-tracker.md` — charter,
   canon authority, slice sequence, current position. Start here every resume.
2. **Initiative brief + cutover mechanics:** `_wip/identity-foundation/586-completion-prg-handoff.md`,
   then its cited artifacts (`586-staging-cutover-execution-log.md`, `2026-06-11-cutover-plan.md` §4,
   `wi586-readiness-2026-06-14.md`, `pending-migrations/`).
3. **Substrate operating rules:** repo `AGENTS.md`; worktrees via `.agents/skills/worktree-setup/SKILL.md`
   (`.worktrees/<branch>`); commit via the commit skill (own-work scope); Doppler for secrets
   (`--project mentomate`, never print values); read precise SQL/endpoint/constraint strings natively, not via rtk.

## 2. Standing rules (inherit these)
- **Canon wins; S0–S6 design choices are NOT canonical.** Reconcile the reader/writer surface
  *to canon*, not to what S0–S6 built.
- **First work = WP-1: statically enumerate the full breaking reader/writer set** — do not
  discover endpoint-by-endpoint. Fold the pre-graph 401 fix (`de8df6e86`) in as slice-1.
- Missing twins (e.g. `listProfilesV2`) are **ownership-scoping security-sensitive → TDD**.
- Run the real process: writing-plans → scoped WPs → reviewed PRs → full + 51 integration gate.
  Not an ad-hoc 77-file sweep. **The legacy drop is the terminal step of the code migration.**
- **Defer the S4–S6 fold-in decision** until WP-1 sizes the surface.

## 3. Checkpoint duty + boundary events (report upward)
- Write state back: Cosmo immediately; tracker §5 at checkpoint cadence (disposable-shepherd invariant).
- A **separate reviewer** (different runtime) closes WIs — you self-monitor Cosmo for verdicts; you do not own the watcher.
- **Boundary events to report to the orchestrator:** "code half complete + full/integration suites green"
  (the precondition for the terminal data half), and "WI-586 closed" (PRG-06 outcome met → graduation).
- **Operator-gated:** the staging flip and the prod cutover (flip owner = Jorn); all prod/irreversible steps surface for explicit go.
