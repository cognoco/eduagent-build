DOC: docs/plans/2026-05-19-mobile-lab-macos-setup-plan.md (2026-05-19, 12K)

CLAIMS:
- Set up a dedicated, lightly-isolated macOS user account (`mobile-lab`) on "the current Mac Mini" to own the entire mobile E2E toolchain: Homebrew-adjacent SDKs, Java 17, Maestro, Android SDK/emulator, Doppler, Expo dev-client/Metro, and later Xcode/iOS Simulator.
- 13 sequential tasks (account creation → shared-baseline check → Java/Maestro/Android SDK/emulator install → dev-client install → Metro/Maestro smoke run → teardown → reserve the account for future iOS work), each with checkbox-tracked steps.
- A closing "Validation Checklist" (9 items) that must all be true before the setup is "complete."
- 4 "Open Decisions" left unresolved at write-time (repo clone vs. worktree, Android Studio install method, dev-client install method, Node 24 vs 22).
- No status banner anywhere in the doc — unlike rows 23 and 25, this doc was never updated with an execution status.

TECH VALIDITY: no technical claims to invalidate — this is a pure ops/setup runbook, not a code claim. The one verifiable fact is account existence, checked directly.

IMPLEMENTED: none. Zero of 40 checkboxes are checked (`grep -c '- \[x\]'` → 0, `grep -c '- \[ \]'` → 40) — this plan was never executed, not even partially. No `mobile-lab` macOS account exists on this machine (`id mobile-lab` → "no such user"; `/Users/` lists `detritus`, `jornjorgensen`, `observatory`, `rincewind`, `vetinari`, `zuzanakopecna`, `Shared`). The actual mobile-E2E workflow that exists today runs a different architecture entirely: `.agents/skills/e2e/SKILL.md` is explicitly OS-agnostic (`uname -s` branches Darwin/Linux/MINGW*), and project memory (`user_device_small_phone.md`, Windows-username-JNI memory) confirms E2E work is actually done from Windows dev machines (`zuzanakopecna`, a Windows username with a diacritic that breaks Maestro JNI — a problem that wouldn't exist under this plan's macOS-only design). The dedicated-macOS-account architecture this plan proposes was never adopted; the team runs E2E per-developer, per-OS, ad hoc instead.

CANDIDATE WIs: none extracted for this row (Pre-bucket C, zero candidates) — no fates to assign.

VERDICT: obsolete

MVP RECOMMENDATION: out — no MVP relevance either way. This is process infrastructure that was superseded by a simpler, already-working alternative (the OS-aware `/e2e` skill + per-developer local Android setup) before a single step was executed. Nothing to finish, nothing to hide — it's dead. Recommend archiving the doc to `docs/_archive/plans/` (it currently sits in the live `docs/plans/` directory, which invites a future reader to think it's actionable) with a one-line superseded-by note pointing at `.agents/skills/e2e/SKILL.md`.

CONFIDENCE: high — account-existence check and checkbox count are both direct, unambiguous facts, and the actual working alternative is independently documented in project memory and the live e2e skill. One decidable question, and it's for Zuzka (not the operator) since it's a team-process fact, not a security/product ruling:
1. Was a `mobile-lab`-style dedicated account ever set up on a *different* physical machine (the doc says "the current Mac Mini," which may not be this Ramtop box), or has the team fully standardized on per-developer local E2E setup? This determines whether "obsolete" or "superseded-elsewhere" is the more precise archival note.
