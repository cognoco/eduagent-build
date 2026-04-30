---
name: CR-124-SCOPE resolved
description: Session-recap profile scoping IDOR fix — routed through scoped repo methods, break tests in place
type: project
originSessionId: 98bbdc9b-3688-47f3-bbe4-4f8613b57730
---
`resolveNextTopic` and `matchFreeformTopic` (in `apps/api/src/services/session-recap.ts`)
were deferred findings from PR #124 that read `curriculumTopics`/`curriculumBooks`
without profile ownership enforcement. Closed on `proxy-parent-fix` in
commits tagged `[CR-124-SCOPE]` (3 commits on 2026-04-23/24):

- `1c910bdc` — scoped `curriculumTopics` readers (`findById`, `findLaterInBook`,
  `findMatchingInSubject`), `listCompletedTopicIds()` on retentionCards/sessions,
  empty-profileId invariant guard, `CurriculumTopicRow` export.
- `f096340e` — `resolveNextTopic(repo, topicId)` signature change, observability
  log `session_recap.resolve_next_topic_miss`.
- `9367447a` — `matchFreeformTopic(repo, …)` signature change, `MAX_FREEFORM_MATCHES`
  constant.

Integration break tests in `apps/api/src/services/session-recap.integration.test.ts`
(held local uncommitted on 2026-04-24 due to parallel-session commit contention;
3/3 pass against real DB, break-test verified by removing
`eq(subjects.profileId, profileId)` from `findMatchingInSubject` — cross-profile
test failed with profile B's "Photosynthesis" row leaking, then restored and green).

**Why:** Defense-in-depth for future parent-proxy flows where a malformed
caller could have passed another profile's topicId. The upstream session-
ownership check still existed, but the repository layer did not enforce
ownership, leaving the door open for a second-order leak.

**How to apply:** When adding any new read in `session-recap.ts`, use
`repo.<namespace>.<method>()` — never `repo.db.select(...)`. If a new table
read is needed, add a scoped method to `createScopedRepository` rather than
bypassing it. The two-innerJoin pattern (`table → curriculumBooks → subjects`
with `eq(subjects.profileId, profileId)`) is the canonical way to scope a
table that has no direct `profileId` column.
