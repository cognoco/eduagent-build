## What was done
Implemented the subject-hub in-context manage sheet (WI-1119): add-subject affordance on the populated browse path and a manage/archive action sheet for individual subjects within the SubjectHub screen.

## What changed
- `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx` — fixed Defect A: replaced raw `useParentProxy()` with `useNavigationContract().isParentProxy` (canonical nav-contract pattern); resolved merge conflicts from main (#1593 tutor→mentor rename, #1603 harden cleanup, #1654 no-db annotation).
- `apps/mobile/src/components/subject-hub/SubjectHubManageSheet.tsx` — fixed Defect B: added `accessibilityViewIsModal` to `<Modal>` for screen-reader boundary; collapsed multi-paragraph JSDoc to single line (AGENTS.md compliance).
- `apps/mobile/src/components/subjects/SubjectsBrowse.tsx` — resolved merge conflict: kept main's grouped status-section rendering (active/paused/archived via `groups.map`) and added WI-1119's create-button on the populated path.
- `apps/mobile/eas.json` — restored accidentally dropped `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true` on development and preview EAS profiles (force-push conflict artefact).
- Supporting: new test files for SubjectHub screens, updated locale files, source-baseline.json.

## Verification
- PR #1604 merged to main as squash b8ce52aa.
- All required CI checks passed: `main`, `Playwright web smoke`, `API Quality Gate`, `Merge completeness check`, `Flag-ON integration (IDENTITY_V2_ENABLED)`.
- claude-review: APPROVED, 0 MUST_FIX, 0 SHOULD_FIX.
- `eas.json` diff vs main: clean (zero delta) after restoration of V2 flag.
- No `tutor` references in changed mobile files (rename correctly applied).

## Caveats / Follow-ups
None. All defects identified in the WI scope were fixed. The eas.json regression was caught and corrected before merge.
