# Agent 2 - Home / Subject Checkpoint

Date: 2026-05-22
Branch context: i18n-translations, HEAD ae5cacc8a
API target: https://api-stg.mentomate.com
Preview target: http://127.0.0.1:19006
Device/browser: Playwright Chromium mobile viewport 390x844; static/code-backed review for authenticated-only rows

## Sources Read

- `docs/flows/plans/student-flow-revision-plan.md`
- `docs/flows/student-flow-access-inventory.md`
- Relevant HOME/SUBJECT/ACCOUNT rows in `docs/flows/mobile-app-flow-inventory.md`
- `docs/specs/2026-05-21-navigation-contract.md`
- Existing web E2E specs/runbook for SUBJECT-16 and SUBJECT-17

## Browser Checks

- `/home` redirects signed-out users to `/sign-in?redirectTo=%2F%28app%29%2Fhome`.
- Sign-in screen renders expected anonymous controls, including `try-mentomate-cta`.
- Preview path renders `/preview`, `/preview/intent`, and `/preview/topic` for the self path.
- Full authenticated web setup was not rerun per shared instruction because it recently hit a session-expired return to sign-in and should not be run in parallel.

## Bugs Filed In Notion

1. `[ACCOUNT-04] Shared-account child profile is forced into parent proxy`
   - Notion: https://www.notion.so/3688bce91f7c814a9182e9324c21a6d2
   - Priority: P1
   - Found In: `student-flow-revision-2026-05-22 / Batch 2 / ACCOUNT-04`
   - Evidence: `use-parent-proxy.ts` and `profile.ts` mark any non-owner profile with an owner in the profile list as proxy mode; `LearnerScreen` then hides student Study actions, add-subject affordances, My Notes, empty-subject CTA, and coach band; `_layout.tsx` hides More through proxy tabs.
   - Affects: ACCOUNT-04, ACCOUNT-30, HOME-01/HOME-05, and SUBJECT entry/use flows for switched child profiles.

2. `[HOME-08] Learner subject-loading timeout loops back to Home`
   - Notion: https://www.notion.so/3688bce91f7c812aa468c368650d6a4d
   - Priority: P2
   - Found In: `student-flow-revision-2026-05-22 / Batch 3 / HOME-08`
   - Evidence: `LearnerScreen` has a separate 15s subject-loading timeout whose secondary action uses `router.replace(homeHref)`, normally returning to the same stuck Home path instead of Library/More or another recovery route.

3. `[SUBJECT-02] Library empty CTA says Back to Home but opens create subject`
   - Notion: https://www.notion.so/3688bce91f7c81f8a205f3b2ccc7ffa1
   - Priority: P3
   - Found In: `student-flow-revision-2026-05-22 / Batch 3 / SUBJECT-02`
   - Evidence: `library.tsx` pushes `/create-subject?returnTo=library`, but the label key is `library.empty.goHome` with English text `Back to Home`.

4. `[SUBJECT-16] App-language sync skips newly active profile after profile switch`
   - Notion: https://www.notion.so/3688bce91f7c814cae57f5fb7b0558b5
   - Priority: P2
   - Found In: `student-flow-revision-2026-05-22 / Batch 3 / SUBJECT-16`
   - Evidence: `use-mentor-language-sync.ts` stores only the last synced language, not the profile id. After syncing profile A to `nb`, switching to profile B while app language remains `nb` can suppress the mutation and leave profile B stale.

## Row Outcomes

- ACCOUNT-02: Static/code-backed pass for home/subject relevance. Additional profile creation is parent-owned child setup; parent remains active after creation. No new bug beyond child-switch proxy behavior.
- ACCOUNT-04: Bug filed. Child/non-owner profile switches are treated as parent proxy.
- ACCOUNT-05: Static/code-backed pass. Family/max-profile gates exist; no new student home/subject issue found.
- ACCOUNT-18: Static/spec pass for subject analogy preference relevance; no new issue found in home/subject setup.
- ACCOUNT-30: Covered by ACCOUNT-04 bug because proxy restrictions are triggered too broadly for switched child profiles.
- HOME-01: Static/code-backed pass for non-proxy student Home; blocked for switched child profiles by ACCOUNT-04.
- HOME-02: Static/code-backed pass. Study mode renders learner Home; Family mode renders parent Home.
- HOME-03: Static/code-backed pass. Study tabs remain learner-oriented; Family mode does not leak into Study tab set.
- HOME-04: Anonymous preview pass for signed-out entry and preview path. No authenticated splash rerun.
- HOME-05: Static/code-backed pass for non-proxy empty-subject path to create-subject; child-profile variant affected by ACCOUNT-04.
- HOME-06: Static/code-backed partial pass. Resume target code routes to active profile learning session; no seeded live rerun.
- HOME-07: Static/code-backed pass for home/family gating relevance; no new student trap found.
- HOME-08: Bug filed for learner subject-loading timeout recovery loop.
- SUBJECT-01: Static/code-backed pass for non-proxy Home add/study-new entry; child-profile variant affected by ACCOUNT-04.
- SUBJECT-02: Bug filed for Library empty CTA copy mismatch.
- SUBJECT-03: Static/code-backed pass/partial for chat-to-create-subject return path; child-profile variant affected by ACCOUNT-04.
- SUBJECT-04: Static/code-backed partial pass for homework-to-subject branch; camera/hardware portion not rerun.
- SUBJECT-05: Static/code-backed pass/partial for resolve/suggestions/use-my-words path; no new issue found.
- SUBJECT-06: Static/code-backed pass/partial for broad topic to pick-book path; no new issue found.
- SUBJECT-07: Static/code-backed pass/partial for focused/focused-book first-session path and retry fallback; no new issue found.
- SUBJECT-08: Static/code-backed pass/partial for four-strands language setup path; no new issue found.
- SUBJECT-12: Static/code-backed pass/partial for shelf/book/curriculum detail route; no new issue found.
- SUBJECT-14: Static/code-backed partial pass. Current route appears to be practice assessment/picker rather than the older inventory `/assessment` label; no end-user bug filed from this pass.
- SUBJECT-16: Bug filed for app-language sync being language-only rather than profile-scoped.
- SUBJECT-17: Static/code-backed pass/partial using existing web spec and code; pronoun age gate and direct route exist; no new issue found.

## Native-Only Skips / Blockers

- No row was fully skipped as native-only.
- Native camera/hardware and seeded authenticated sessions were not rerun in this agent pass.
- The main blocker for deeper end-to-end confirmation was the shared instruction not to rerun full authenticated setup/full suites in parallel after the prior session-expired setup failure.
