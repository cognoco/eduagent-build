DOC: docs/plans/2026-05-31-profile-setup-personalization-corrections.md (2026-05-31, 28K)

CLAIMS: (per-task, 1 line each)
1. T1 — no first-run personalization checkpoint exists; `create-profile.tsx` still routes straight to home/create-subject, never through `/onboarding/*`.
2. T2 — pronouns screen (`onboarding/pronouns.tsx`) exists but has zero production entry points from first-run or settings.
3. T3 — tutor-prose conversation-language settings picker doesn't exist; the only settings language row (`more/account.tsx`) drives `i18next.language` (UI shell), never `useUpdateConversationLanguage`. Parent-created children never get `conversationLanguage` seeded at creation, so they're silently stuck on English tutor prose forever (H-EU-2).
4. T4 — birth-date correction API/UI ⛔ explicitly deferred by the plan itself (identity-coupled, dead-end 403 risk); not built.
5. T5 — interests editor is duplicated between `mentor-memory.tsx` and `child/[profileId]/mentor-memory.tsx`, not factored into one reusable component, and not wired into first-run.
6. T6 — nav/i18n reconciliation for whatever new strings ship with T1-T5; N/A until those land.

TECH VALIDITY: per broken assumption, file:line
- T1 confirmed current: `apps/mobile/src/app/create-profile.tsx:184-186` — `handleClose` calls `goBackOrReplace(router, '/(app)/home')`. No push to `/onboarding/*` anywhere in the file. The `onboarding/index.tsx` route that does exist is an unrelated V2-nav redirect (`href="/(app)/n"`), not this plan's personalization chain — confirms the plan's own "orphaned /onboarding/index" framing.
- T2 confirmed current: `rg "onboarding/pronouns"` across `apps/mobile/src` returns only the screen's own file and its own test — zero production callers.
- T3 confirmed current: `apps/mobile/src/app/(app)/more/account.tsx:84-91` renders only `settings.appLanguage` → `i18next.changeLanguage` (UI shell). No `useUpdateConversationLanguage` import, no conversation-language row anywhere in the file. `PATCH /onboarding/language` (self) and `/onboarding/:profileId/language` (guardian) are live and ownership-checked (`apps/api/src/routes/onboarding.ts:54-117` — confirmed route exists), so this genuinely is pure UI wiring against an already-live API, as the plan claims [L-1].
- T4 confirmed deferred/unbuilt: no `/onboarding/birth-year` route, no `birthYearPatchSchema`, no `updateBirthYear` service function anywhere in `apps/api/src`. Matches the plan's own "DEFERRED" tag.
- T5 confirmed current: `InterestEntry`/interests-context editing code is present separately in both `apps/mobile/src/app/(app)/mentor-memory.tsx` and `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` (both reference `session.mentorMemory.sections.interestsContextHint`) with no shared extracted component; no first-run usage.
- Plan's own header is internally authoritative and current: `implementation_status: none (verified 2026-06-09)`, and the 2026-06-27 rename-gate addendum correctly reclassifies the `T1+T2+T3+T5` slice as **independent** of the `profiles`→`person` rename (no migration, no new `profiles`-FK — this plan only wires existing mobile primitives against already-live owner-gated endpoints). That addendum is consistent with current repo state: `WI-586`'s `m-repoint`/`m-drop` are still inert (per this session's row-8/9 checks of the same freeze state), so the "independent, buildable now" classification holds today.

IMPLEMENTED: per claim — none/partial/complete/superseded, file:line
1. none — T1, no candidate WI extracted for this row (register only lists WI-1496).
2. none — T2, no candidate WI extracted.
3. none — T3 = WI-1496.
4. n/a (deliberately deferred by the plan, not "unimplemented" in the gap sense) — T4, no candidate.
5. none — T5, no candidate.
6. none — T6, no candidate.

CANDIDATE WIs: each with fate: adopt / merge-into-<WI> / kill (+reason)
- WI-1496 (tutor-prose conversation-language settings picker) — **adopt**. Tech-confirmed current and correctly scoped: pure UI wiring against a live, owner-gated API; no migration; no new authorization logic. This is the plan's own top "80/20 slice" item and the single highest-value, lowest-risk gap in the whole document — a managed child can be **permanently** stuck with an English-speaking tutor with zero visible signal, which is a core value-prop miss (tutor-prose language is a headline feature), not cosmetic.

VERDICT: partially-implemented
The plan's own "80/20 slice" (T1+T2+T3+T5) is **entirely unimplemented** — verified against current source, not just the plan's 2026-06-09 header, which still holds. Only T3 (the highest-value item) has a captured candidate (WI-1496); T1/T2/T5 have no tracked WIs at all despite being explicitly recommended "do, after re-triage" in the plan's own 80/20 table. T4 is correctly and deliberately deferred (identity-coupled, unresolved end-user dead-end risk) and appropriately has no candidate.

MVP RECOMMENDATION: in / out / finish-or-hide vs north star (Config T V2 shell on Google Play, RevenueCat Plus-only, proven V1 fallback)
- **IN:** WI-1496 (T3, language picker). Small, no migration, no auth-model coupling to the identity-foundation rename, and directly fixes a silent core-value-prop gap for guardian-managed children — exactly the persona MVP must not silently fail. Burden of proof met: cheap fix, real user-facing defect, tech-confirmed today.
- **Flag for Phase 2 (not this row's candidate set):** T1 (first-run checkpoint) and T2 (pronouns wiring) and T5 (interests dedup+first-run) are the plan's own recommended do-now slice alongside T3, but none were extracted as candidates in this row. T1/T2 in particular gate discoverability of T3's fix (a guardian never sees the language picker if first-run never routes there) — landing T3 alone without at least T2's settings-entry-point half risks a fix nobody finds. Recommend capturing a WI for the settings-only sliver of T2 (pronouns settings row) if T1's full first-run checkpoint is deferred as V2-shell-shaped work.
- **OUT (correctly deferred, agree with plan):** T4 birth-date correction. Real risk (privilege-escalation surface, dead-end 403 for self-registered minors with no guardian) for modest value; revisit only after the identity reset lands and a support-side correction SOP exists.

CONFIDENCE: high + up to 3 decidable Zuzka questions
Tech state is unambiguous — plan's own "verified 2026-06-09" header and 2026-06-27 rename-gate addendum both check out against current source with no drift found.
1. Confirm: should WI-1496 ship standalone (settings-only entry point, e.g. via a small addition to `more/account.tsx` alongside the existing App Language row) rather than waiting on T1's full first-run checkpoint — given T1/T2/T5 have no tracked WIs and T3 alone is enough to close the H-EU-2 gap if the settings row is reachable?
2. Should T2 (pronouns settings-entry sliver only, not full first-run) get a WI now, since a settings-reachable pronouns row is comparably cheap to T3 and was in the same "do-now" bucket?
3. Is the identity-foundation re-triage gate (plan's "hard gate" for the whole 80/20 slice) formally cleared, or still pending a sign-off separate from the 2026-06-27 addendum's own self-assessment?
