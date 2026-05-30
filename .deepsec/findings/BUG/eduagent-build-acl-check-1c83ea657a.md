# [BUG] Parent proxy sessions can mutate child progress state

**File:** [`apps/api/src/services/snapshot-aggregation.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/snapshot-aggregation.ts#L973-L1221) (lines 973, 999, 1164, 1167, 1221)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

refreshProgressSnapshot() writes progress snapshots, stores milestones, and queues celebrations. listRecentMilestones() can also backfill milestone rows. The route call sites use requireProfileId(), but do not apply assertNotProxyMode(); since profileScopeMiddleware permits a parent to resolve a linked child via X-Profile-Id, a parent proxy request can mutate child-owned progress/milestone/celebration state despite proxy-mode write guards used on other write routes.

## Recommendation

Add assertNotProxyMode() to the effectful progress routes, or split these services into read-only parent-safe paths and owner/system-only mutation paths. Move milestone backfill out of GET handling or gate it behind an owner/system authorization path.

## Revalidation

**Verdict:** true-positive

Partially fixed; a real but benign residual remains. The headline mutation vector — `refreshProgressSnapshot()` (writes snapshots via upsertProgressSnapshot, stores milestones via storeMilestones, AND queues celebrations via queueCelebration L1343) — is now fully proxy-guarded: its only HTTP caller, POST /progress/refresh, calls `assertNotProxyMode(c)` (snapshot-progress.ts L78, [WI-174/DS-085]); the other two callers are Inngest cron/session jobs with no Hono context. `queueCelebration` is reachable ONLY from refreshProgressSnapshot, so the celebration side-effect the finding worried about is closed. However, the finding explicitly also names `listRecentMilestones()`, and that path is still exposed: GET /progress/milestones (snapshot-progress.ts L60-75) has NO `assertNotProxyMode`, and `listRecentMilestones` (L1077) conditionally calls `backfillSessionMilestones` → `storeMilestones` (L1074), a real INSERT, during a parent's proxy read. Because profileScopeMiddleware only resolves same-account children, this is not cross-tenant; the write is idempotent (`onConflictDoNothing` on the (profileId, milestoneType, threshold) unique index), gated by an `existingSessionMilestones.length < expectedCount` check (no amplification), materializes only already-earned `session_count` milestones, and produces no celebration/notification. (`buildKnowledgeInventory` on GET /progress/inventory is read-only — no writes.) It is a genuine proxy-mode write-bypass per the threat model, but with negligible impact, so I downgrade MEDIUM→BUG. The finding's specific recommendation to 'move milestone backfill out of GET handling' was not implemented.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-25)
