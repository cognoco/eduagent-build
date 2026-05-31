# [BUG] subjectId route param not normalized for array case (inconsistent with sibling screen)

**File:** [`apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx#L125-L131) (lines 125, 126, 127, 131)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-param-handling`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`subjectId` is read via `useLocalSearchParams<{ subjectId: string }>()` (L125) and used directly as a string in `useVocabulary(subjectId ?? '')`, `useDeleteVocabulary(subjectId ?? '')`, the `subjectsQuery.data?.find((s) => s.id === subjectId)` lookup (L131), and the `goBack`/render paths. Expo Router can surface a query/route param as `string[]` (e.g. a crafted deep link with duplicate `?subjectId=a&subjectId=b`, or a path+query name collision). The sibling screen `child/[profileId]/subjects/[subjectId].tsx` (L69-74) explicitly guards this with `Array.isArray(rawSubjectId) ? rawSubjectId[0] : rawSubjectId`, but this screen does not. If an array arrives: the subject-name `find()` never matches (silently falls back to the generic title) and an array is passed as the `param: { subjectId }` to the Hono RPC call, producing a malformed request. This is NOT a security vulnerability — the API scopes the query to the server-verified `profileId` via `requireProfileId()` in `vocabulary.ts`, so no cross-profile data can be reached regardless of the supplied subjectId. Impact is limited to a broken/cosmetic state on a malformed deep link.

## Recommendation

Normalize the param the same way the sibling screen does: `const subjectId = Array.isArray(rawSubjectId) ? rawSubjectId[0] : rawSubjectId;` after destructuring `useLocalSearchParams`, then use the normalized value throughout. This keeps the two screens consistent and avoids passing an array to the RPC layer.

## Revalidation

**Verdict:** true-positive

Verified the inconsistency and its bounded impact. Line 125 reads `const { subjectId } = useLocalSearchParams<{ subjectId: string }>()` and uses it raw in useVocabulary(subjectId ?? '') (126), useDeleteVocabulary (127), the `subjectsQuery.data?.find(s => s.id === subjectId)` lookup (131), and the `!subjectId` gate (165). The sibling child/[profileId]/subjects/[subjectId].tsx normalizes BOTH path params at lines 69-74 (`Array.isArray(rawSubjectId) ? rawSubjectId[0] : rawSubjectId`), and the repo ships a dedicated helper (lib/route-params.ts firstParam) precisely because Expo Router surfaces `string | string[]` when a key appears twice (path+query collision or duplicate query keys). That the sibling guards subjectId — itself a path param — confirms the team treats the array case as reachable for these routes. On an array value: `!subjectId` is false (array is truthy) so the no-subject fallback is skipped; the find() never matches (s.id is a string) so the title silently falls back to the generic vocabulary.fallbackTitle; and the array is passed as `param: { subjectId }` to the Hono RPC, producing a malformed request. Correctly NOT a security issue: use-vocabulary.ts scopes the query through the active profile's API client (X-Profile-Id), so no cross-profile vocabulary is reachable regardless of subjectId — worst case is a 404/empty → loadError state. Real consistency/robustness BUG matching the finding and the repo's 'Sweep when you fix' rule; medium confidence and BUG severity are apt.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-19)
