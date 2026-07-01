What was done: Restored Practice access on the learner Journal landing for WI-1207 (Restore Practice access on Journal landing).

What changed: JournalTabView now includes a Practice section button between Sessions and Memory, renders a Practice hub CTA, and shows past Practice activity using the existing usePracticeActivityHistory hook with server-driven type filters. JournalTabView tests now cover the five-section control, Practice hub routing, activity row rendering, and type-filter query options. Journal Practice locale keys and source-baseline entries were restored.

Verification: Red/green checked the focused Journal regression: first run failed because journal-tab-practice was missing; final run passed 18/18 tests in apps/mobile/src/components/journal/JournalTabView.test.tsx. Also passed pnpm check:i18n:orphans, pnpm check:i18n, pnpm exec prettier --check on changed files, pnpm prepush (tsc --build), and push-time pre-push validation with 71/71 related tests plus i18n checks.

Caveats / Follow-ups: Focused Journal test still emits existing Expo environment and speech-recognition act warnings; the suite passes and this change did not introduce those warnings. No follow-up required for this work item.
