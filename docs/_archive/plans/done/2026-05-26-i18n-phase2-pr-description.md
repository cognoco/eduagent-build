# i18n Phase 2 — UI Strings Hygiene

**Before: 2452 keys, After: 1902 keys, Removed: 550 keys** (per locale; all 7 of en/de/es/ja/nb/pl/pt now 1902).

## What this does

1. **Sweeps 550 reverse-orphan keys** out of `en.json`, cascaded to the 6 target
   locales via `pnpm translate` (deletions-only short-circuit — no LLM calls).
2. **Rewrites `scripts/check-i18n-orphan-keys.ts`** from a line-by-line regex
   scanner to a `ts-morph` AST walker. It now correctly resolves multi-line
   `t()` calls, renamed-`t` aliases, `i18next.t(…)` member calls, template
   prefixes, `cond ? 'a' : 'b'` / `x ?? 'a'` / `as`-cast args, and
   `const tr = t` rebindings.
3. **Makes unused-key (reverse-orphan) detection a default-on CI gate** with a
   `--allow-unused` local-debug opt-out, wired into pre-commit (on `.ts/.tsx`,
   `en.json`, or `i18n-keep.ts` edits) and CI.
4. **Adds the co-located allow-list** `scripts/i18n-keep.ts` (`KEEP_PATTERNS`,
   Zod-validated, each entry citing a real `file:line`) plus
   `scripts/check-i18n-keep-rot.ts` (liveness guard — fails if a cite rots).
5. **Documents the 7-UI / 10-conversation language asymmetry** + the UI-strings
   hygiene workflow in `CLAUDE.md` and `AGENTS.md` (mirrored).

## Per-feature-cluster rationale

Deletions by namespace and the features they belonged to are in
`docs/plans/2026-05-26-i18n-phase2-diagnostic.txt` (with `git log -S` spot
checks). Largest clusters: `parentView` (129), `subscriptionScreen` (84),
`progress` (82), legacy flat `(root)` keys (133) — all reverse-orphans from
removed/refactored dashboard, child-card, camera, subscription, and progress
features.

## Diagnostic dump + dynamic-call-site decisions

See `docs/plans/2026-05-26-i18n-phase2-diagnostic.txt` for the verbatim diagnostic
output, the full namespace breakdown, and the triage decision for every
runtime-dynamic `t()` call site (walker-extracted vs `KEEP_PATTERNS` vs
`// i18n-allow-multi-var` escape).

## Notes for reviewers

- **38 keys retained on purpose.** They appear as literals only in test
  `jest.mock('react-i18next')` fixtures (which don't read `en.json`) or as
  coincidental root-word strings. Deleting them does not break tests; the
  associated stale-test-fixture cleanup is a separate follow-up.
- **Checker scope gap (Phase 3 follow-up):** hardcoded JSX literals that never
  pass through `t()` are not caught. Documented in the new CLAUDE.md/AGENTS.md
  "Languages → Known gap" section.

## Coordination (do before opening / merging)

This PR rewrites all 7 locale files in one commit, so it collides with any
in-flight branch that adds/renames i18n keys. Per the spec's in-flight protocol:

1. Enumerate branches touching `en.json`
   (`git for-each-ref … | git diff --quiet main..{} -- …/en.json`).
2. Announce in the team channel; list those branches by name.
3. Hold the merge until they land or rebase on top of this sweep; re-run the
   diagnostic after any such merge (the unused list goes stale otherwise).
4. If an upstream merge lands during review, rebase + re-run `pnpm translate`
   (cheap — deletions-only short-circuit) before re-requesting review.
5. Hold through one merge-window with no other `en.json`-touching merges.

> Note: a `git pull --rebase` + `merge main into i18n-2` ran on this branch
> during implementation; the sweep was recomputed against the post-merge tree
> and re-verified green, but confirm no further concurrent en.json edits before
> committing.
