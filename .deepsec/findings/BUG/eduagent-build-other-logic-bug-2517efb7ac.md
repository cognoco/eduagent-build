# [BUG] Sample-lesson buttons can stay permanently disabled after returning to the screen (missing submitting reset)

**File:** [`apps/mobile/src/app/preview/topic.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/preview/topic.tsx#L48-L110) (lines 48, 57, 58, 77, 110)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

PreviewTopicScreen gates its sample-lesson buttons on a `submitting` flag (set true in onSelect at L57-58, consumed at L110-116 via `disabled={submitting}` and `opacity: submitting ? 0.6 : 1`). onSelect sets `setSubmitting(true)` and then `router.push('/preview/value-prop')` (L77-80) but never resets the flag. Unlike the sibling screens both.tsx (L45-49) and intent.tsx (L55-59), this screen has no `useFocusEffect(() => setSubmitting(false))`. With expo-router / React Navigation, pushing value-prop keeps the topic screen mounted, so when the user navigates back (hardware back button or swipe-back gesture) the same instance is shown with `submitting` still true — all three sample buttons remain disabled at 0.6 opacity, stranding the user on the screen. The visitor can only escape via the 'Back to sign in' link (which calls router.replace). This is reachable from every entry into topic (intent 'self'/'not_sure' and both.tsx 'self_first'). It directly contradicts the repo's UX Resilience Rules against dead-end states, and the fix already exists in the two sibling files.

## Recommendation

Mirror both.tsx/intent.tsx: add `useFocusEffect(useCallback(() => { setSubmitting(false); }, []))` (importing useCallback and useFocusEffect) so the submitting flag resets whenever the screen regains focus.

## Revalidation

**Verdict:** true-positive

Confirmed by reading the full file plus the stack layout and both siblings. preview/_layout.tsx:10 uses a <Stack> navigator, so router.push('/preview/value-prop') at L77-80 keeps PreviewTopicScreen mounted in the stack; React Navigation preserves the previous screen's component state, so a hardware-back or swipe-back returns to the same instance with submitting still true. A grep proves setSubmitting is referenced only at L48 (useState declaration) and L58 (setSubmitting(true)) — there is no setSubmitting(false) anywhere in the file, on any path. The mount-only useEffect (deps []) does not re-run on return because the screen was never unmounted. With submitting stuck true, all three sample Pressables are disabled (L110) at 0.6 opacity (L112), leaving only the un-gated 'Back to sign in' router.replace link, which exits the preview flow — a genuine dead-end relative to the screen's purpose and a direct violation of the repo's UX Resilience Rules. The fix already exists in the two sibling files: both.tsx:45-49 and intent.tsx:55-59 both import useFocusEffect and reset submitting on focus; topic.tsx neither imports nor uses it. topic.test.tsx has no test asserting the disabled-on-return state, so the behavior is not intentional. Every cited line number is accurate and the recommended useFocusEffect fix is correct. BUG severity is appropriate (UX defect, not a security issue).

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-20)
