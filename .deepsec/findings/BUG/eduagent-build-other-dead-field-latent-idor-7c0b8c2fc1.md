# [BUG] Dead `childProfileId` field in tellMentorInputSchema is a latent cross-profile (IDOR) footgun

**File:** [`packages/schemas/src/learning-profiles.ts`](https://github.com/cognoco/eduagent-build//blob/main/packages/schemas/src/learning-profiles.ts#L284-L290) (lines 284, 285, 286, 287, 288, 289, 290)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-dead-field-latent-idor`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`tellMentorInputSchema` (L284-290) declares `childProfileId: z.string().uuid().optional()`, but the consuming handler `POST /learner-profile/tell` (apps/api/src/routes/learner-profile.ts:361-377) destructures only `{ text }` and calls `parseLearnerInput(db, profileId, text, 'learner')` using the SERVER-verified `profileId`. The legitimate parent-on-child path is the separate `POST /learner-profile/:profileId/tell` route, which derives the target from the URL param and gates it with `assertOwnerAndParentAccess` (isOwner + parent-chain ownership). So the body `childProfileId` is never read today — it is dead schema surface. It is NOT currently exploitable. The risk is latent: the self route only runs `assertNotProxyMode` and has NO parent/child ownership check, so a future contributor who 'wires up' the already-present `childProfileId` field (reasonably assuming the schema reflects intended behavior) would create a cross-profile write/inference-injection IDOR — a parent or any account could target another profile's mentor-memory by supplying its UUID in the request body. This matches the repo's own guardrail that 'orphaned types create false confidence' (CLAUDE.md, Code Quality Guards).

## Recommendation

Remove `childProfileId` from `tellMentorInputSchema` since no handler consumes it; targeting a child is (correctly) done via the `/:profileId/tell` URL param guarded by `assertOwnerAndParentAccess`. If a body-supplied target is ever genuinely needed, it must be validated through the same `assertOwnerAndParentAccess` parent-chain ownership check before use.

## Revalidation

**Verdict:** true-positive

Verified that childProfileId (L287) is genuinely dead schema surface. The consuming self route POST /learner-profile/tell (routes/learner-profile.ts:361-377) destructures only { text } from the validated body and calls parseLearnerInput(db, profileId, text, 'learner') using the server-verified profileId from profileScopeMiddleware; it never reads childProfileId and gates only with assertNotProxyMode (no parent/child ownership check). The legitimate parent-on-child path is the separate POST /learner-profile/:profileId/tell route (L378-398), which derives childProfileId from the URL param and gates it with assertOwnerAndParentAccess (isOwner + parent-chain ownership) plus assertChildDashboardDataVisible. So the body-supplied childProfileId is never consumed — correctly NOT exploitable today, as the finding itself states. The finding does not claim a live vulnerability; it claims a dead/orphaned field that would become a cross-profile write IDOR if a future contributor naively wired it into the unguarded self route. That factual core (dead field + latent risk on an ownership-unchecked route) is fully verified and aligns with the repo's own 'orphaned types create false confidence' guard. As an honestly-scoped BUG/dead-code finding it is a true-positive; severity BUG (not a security severity) is correct. Recommendation to remove the field is sound.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
