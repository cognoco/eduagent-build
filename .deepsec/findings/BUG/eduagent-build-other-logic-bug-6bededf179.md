# [BUG] Child-mode learning preferences screen previews the parent's accommodation, not the child's

**File:** [`apps/mobile/src/app/(app)/more/learning-preferences.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/more/learning-preferences.tsx#L33-L89) (lines 33, 35, 36, 37, 87, 88, 89)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

When the screen is opened in child mode (childProfileId present in the URL params), the headings switch to the child's name (screenTitle/sectionTitle use childName via t('more.accommodation.childScreenTitle') and t('parentView.index.learningAccommodationTitle')), but the displayed accommodation option is derived from the SELF learner profile. Line 33 unconditionally calls `const { data: learnerProfile } = useLearnerProfile();` (the self profile), and lines 35-37 compute `activeOption` from `learnerProfile?.accommodationMode`. The screen never calls `useChildLearnerProfile(childProfileId)`. As a result, the SettingsRow label/description (lines 87-89) render the PARENT's current accommodation mode under a heading that says it is the child's. A guardian could misread a child's accommodation setting. The actual editor screen (accommodation.tsx) loads the correct child profile via `useChildLearnerProfile`, so the underlying data is not corrupted — this is a display/preview inconsistency only. Note also that, unlike accommodation.tsx, this screen does not validate childProfileId against the user's `profiles[]` or any nav gate before building child-mode hrefs (lines 39-42, 56-59); that is harmless here because the value only flows into internal client navigation, but it means childName silently becomes undefined for an unknown id.

## Recommendation

In child mode, fetch the child's learner profile (e.g. `const childLearner = useChildLearnerProfile(isChildMode ? childProfileId : undefined)`) and derive `activeOption` from the child's `accommodationMode` when `isChildMode`, falling back to the self profile otherwise. Mirror accommodation.tsx's `learnerQuery = canEditChildPreferences ? childLearner : selfLearner` pattern, and apply the same `childProfile?.isOwner === false` + nav-gate guard before treating the id as a valid linked child.

## Revalidation

**Verdict:** true-positive

Verified against the code. In child mode (isChildMode = !!childProfileId), the screen renders child-named headings (lines 48-54 via childScreenTitle/learningAccommodationTitle with childName) yet derives activeOption (lines 35-37) from `useLearnerProfile()` (line 33), which use-learner-profile.ts:56-78 keys on activeProfile?.id and calls `client['learner-profile'].$get({})` with no profileId param — i.e., it always returns the ACTIVE (owner/parent) profile, never the child. The dispositive proof is the sibling editor accommodation.tsx, which deliberately maintains BOTH selfLearner = useLearnerProfile() AND childLearner = useChildLearnerProfile(childProfileId) and switches on canEditChildPreferences (lines 51-55); that separation only makes sense because useLearnerProfile() does not return child data. So a guardian who reaches this screen in child mode with a valid linked child id sees the child's name over the PARENT's accommodation setting. Scope is correctly characterized by the finding: display/preview only — accommodation.tsx (the real editor) loads the correct child profile, so no data is corrupted, and there is no cross-profile read. One caveat strengthening the 'low' likelihood: I found NO in-app navigation that passes childProfileId to learning-preferences — the child-management screen routes child-mode straight to `/(app)/more/accommodation?childProfileId=` (child/[profileId]/index.tsx:968), so the child-mode branch here is reachable only via a hand-crafted `mentomate://` deep link. It is still live, registered code (more/_layout.tsx:24-26) and the defect is real, so true-positive at BUG severity is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-25)
