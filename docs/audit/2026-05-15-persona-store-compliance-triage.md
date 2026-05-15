# Persona Copy And Store Compliance Triage

Date: 2026-05-15

Status: checkpoint for follow-up implementation. This file captures the two read-only subagent reports so the work is durable before new agents continue.

## Persona And Copy Mismatches

### Real Issues

| ID | Status | Area | Evidence | Next action |
| --- | --- | --- | --- | --- |
| PC-1 | Addressed in code | Delete account | `apps/mobile/src/app/delete-account.tsx` always rendered `delete-account-family-warning`, even for solo owner/self-learner accounts. The copy says "If you have linked child profiles". | Gated on actual linked child profiles. Added tests for solo owner hidden and owner with child shown. |
| PC-2 | Real UX/copy decision | Delete account | `apps/mobile/src/app/delete-account.tsx` always renders the store subscription warning. The current copy is technically conditional enough to be useful for paid users, but noisy for free solo users. | Product/UX decision needed: either show only when subscription state indicates paid/trial, or keep always-visible "If you have..." style compliance warning. |
| PC-3 | Addressed in code/content | App help prompt map | `apps/api/src/services/app-help-map.ts` told parents to switch into a child's profile to edit child preferences. Current mobile IA has direct parent child-detail preferences access. | Updated app-help copy/tests and the app-help spec to the current child-card route. `pnpm eval:llm` refreshed snapshots. |

### Stale Or Obsolete Reports

| ID | Status | Area | Evidence | Decision |
| --- | --- | --- | --- | --- |
| PC-4 | Stale doc | Single learner privacy controls | Old audit says solo learner saw "When I withdraw consent for a child". Current `apps/mobile/src/app/(app)/more/privacy.tsx` gates withdrawal archive controls behind `role === 'owner' && linkedChildren.length > 0`. | No code fix for this exact issue. Add/keep regression coverage if touching the screen. |
| PC-5 | Stale doc | Duplicate parent onboarding notices | Current parent home renders only `ParentTransitionNotice` when children exist; `FamilyOrientationCue` appears dead except for its own test/import. | No live UX fix. Optional cleanup later. |
| PC-6 | Stale doc | Web subscription dead-end | Current web path computes `storePurchaseUnavailable` and renders `free-upgrade-unavailable` instead of the `Upgrade` button. | No web code fix. Native no-offerings edge still needs a UX call if we want to change it. |

## Store Compliance Package

### Real External/Admin Gaps

| ID | Status | Area | Evidence | Next action |
| --- | --- | --- | --- | --- |
| SC-1 | Blocked external/admin | Privacy policy URL | `apps/mobile/app.json` has `privacyPolicyUrl: https://mentomate.app/privacy`, but DNS lookup failed on 2026-05-15. | Publish the policy at that URL, or choose a live URL and update config/store metadata. Need final legal entity and domain. |
| SC-2 | Draft created; admin/legal review needed | App Privacy / Data Safety forms | No repo worksheet for Apple App Privacy or Google Data Safety existed. iOS privacy manifest exists, but that is not the store questionnaire. | Worksheet created at `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`. Complete forms in store consoles once accounts are available and legal/admin confirms answers. |
| SC-3 | Draft created; product/admin input needed | Screenshots | `docs/screenshots_and_store_info/` only had store description copy. No current screenshot set. | Screenshot scene pool and guardrails added to `docs/screenshots_and_store_info/store-compliance-checklist.md`. Choose scenes/captions with product input, then capture current app screens. |
| SC-4 | Draft created; product/legal input needed | Age rating | Existing docs mention likely age rating, but no rating questionnaire answers were stored. | Draft rating guidance added to `docs/screenshots_and_store_info/store-compliance-checklist.md`. Need product decision on exact 11+ / Education category posture. |
| SC-5 | Draft created; admin input needed | Review notes | No review-notes file existed. Facts exist across RevenueCat, subscription UI, consent copy, and AI tutoring docs. | Review-notes draft created at `docs/screenshots_and_store_info/reviewer-notes-draft.md`. Finalize once test accounts/IAP products exist. |

### Already Covered In Code

| ID | Status | Area | Evidence |
| --- | --- | --- | --- |
| SC-6 | Covered | Account deletion flow | More -> Privacy & data -> Delete account exists, with typed `DELETE`, cancel path, API scheduling, and Inngest 7-day deletion. |
| SC-7 | Covered | Camera/microphone permission copy | Native permission strings exist in `apps/mobile/app.json`; runtime camera and microphone permission states exist in mobile UI. |
| SC-8 | Locally covered | Store description | `docs/screenshots_and_store_info/store description.md` contains name, short description, full description, category, and keywords. Needs product review and removal of editor marker glyphs before store entry. |

## Checkpoint Rules For New Agents

- Do not run `git add`, `git commit`, or `git push`.
- Use this file as the shared durable checkpoint.
- For any run longer than 4 minutes, append a short progress note under "Agent Progress Notes" before continuing.
- Report changed file paths in the final response.

## Agent Progress Notes

- 2026-05-15 coordinator: Created durable checkpoint from the two read-only subagent reports before dispatching follow-up agents.
- 2026-05-15 coordinator: PC-1 and PC-3 were patched and verified with focused tests plus `pnpm eval:llm`; SC-2 through SC-5 draft artifacts were created. PC-2 remains open for product/UX choice.
