# Vaulted Emulator / E2E Documentation (2026-04-30)

This directory holds documentation about Android emulator setup, Maestro E2E
testing, and EAS builds that was vaulted during a clean-slate restart of the
mobile E2E infrastructure on branch `emulator-clean-slate`.

## Why this exists

The active docs had accreted ~2 months of contradicting session notes
(2,358 lines in `e2e-emulator-issues.md` alone, with 100+ section headings).
New session entries kept adding rather than replacing, so port numbers, AVD
names, and operational sequences disagreed across sections of the same file:

- AVD name: header said `New_Device`, later sessions said `E2E_Device_2`
- API port: Session 7 said 8788, Session 11+ said 8787
- Maestro version: doc said 2.2.0, struggles doc said 2.4.0
- "Read the FULL doc before any emulator work" rule was operationally
  unsatisfiable (56k tokens vs ~25k single-read limit)

The decision was: stop trying to consolidate in place, vault everything,
restart with empirical verification, and write new short canonical docs as
we re-derive what actually works on this machine today.

## When to consult this

- When a new emulator/E2E doc author needs context on a specific historical
  issue (e.g., "why is there a bundle-proxy.js?", "what is BUG-7?")
- When the empirical restart hits a problem and we suspect a known
  workaround already exists in here

## How to consult

Treat as an inspiration source, not authority. Find the relevant section,
read it, then **verify against current code + a real run** before applying.
Do not copy any procedure verbatim without re-validating it on this machine
in 2026-04-30 or later.

## Original locations (for `git log` reference)

- `docs/E2Edocs/*.md` → `docs/_vault/emulator-2026-04-30/E2Edocs/`
- `.claude/commands/{e2e,build}.md` → `docs/_vault/emulator-2026-04-30/.claude-commands/{e2e,build}.md`
- `.claude/my-skills/{e2e,build}.md` (duplicates, same content as commands/) → `docs/_vault/emulator-2026-04-30/.claude-commands/my-skills_{e2e,build}.md`

## Things deliberately NOT vaulted

- `apps/mobile/e2e/` (flows, scripts, bundle-proxy, preflight) — this is **code**, not journal documentation. The empirical restart will use these as-is and only update them if a specific issue shows up.
- `apps/mobile/e2e/{README,CONVENTIONS}.md` — code-adjacent reference, narrowly useful. May be edited or replaced as part of the new canonical doc.
- Memory files in `.claude/memory/` — global to all sessions, not isolated to this worktree. Memory pruning is a separate, deliberate step *after* empirical verification.

## Restoration

To unvault everything: `git revert` the vaulting commit, or `git mv` files
back to their original locations and delete this directory.
