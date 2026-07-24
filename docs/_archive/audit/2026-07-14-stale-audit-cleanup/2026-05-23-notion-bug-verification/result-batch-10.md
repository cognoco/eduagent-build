# Batch 10 — Notion Bug Verification Results

Branch: `codex/h1-isowner-navigation-contract-sweep` @ `343b0502f`

---

### #86 — Upgrade Prettier 2.x → 3.x
- **Verdict:** ALREADY_FIXED
- **File(s):** `package.json:108`
- **Evidence:** Root `package.json` now declares `"prettier": "^3.0.0"` (line 108). Prettier was bumped in PR #183 / commit `f61e372d2` ("Stabilization: library drill-through and progress polish"). The original `^2.6.2` line came from commit `4203e05a8` (initial) and was replaced in `f61e372d2`.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in `f61e372d2` / PR #183)

---

### #387 — [CR-2026-05-19-M3] Race conditions in session pipeline
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/services/session/session-summary.ts:133-262`, `apps/api/src/services/session/session-exchange.ts:1770-1900`, `apps/api/src/services/billing/trial.ts:194-219`, `apps/api/src/routes/stripe-webhook.ts:101-246`
- **Evidence:** `submitSummary` (session-summary.ts:133-262) still runs sequential `db.update`/`db.insert` for the summary row, then `applyReflectionMultiplier`, then `createNoteForSession` — no `db.transaction()` wrapper. Comment at session-exchange.ts:1798-1810 explicitly acknowledges the driver supports interactive transactions but defers the migration. Most recent edits to session-summary.ts (`e98fec149`, `1dd002629`, `6e0ffb580`, etc.) did not introduce a transaction wrap.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

### #416 — [CR-2026-05-21-011] Onboarding self-routes allow non-owner child to change preferences
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/routes/onboarding.ts:49-72, 103-122, 147-166`
- **Evidence:** The three self-PATCH handlers (`/onboarding/language`, `/onboarding/pronouns`, `/onboarding/interests/context`) only require `requireProfileId(...)` + `requireAccount(...)` — no `isOwner` gate, no rationale comment. Only the parent-on-behalf-of-child variants call `assertOwnerAndParentAccess`. Latest edit (`c25e17648`) hardened parent-on-behalf routes but did not touch self-PATCH gating.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

### #481 — [CR-2026-05-21-076] subject-classify parses LLM output with greedy regex + JSON.parse
- **Verdict:** PARTIALLY_FIXED
- **File(s):** `apps/api/src/services/subject-classify.ts:127, 203`
- **Evidence:** Greedy regex is gone — both call sites now use `extractFirstJsonObject` (lines 127 and 203, comments tagged `[BUG-461] brace-depth walker replaces greedy regex`). However, the suggested `subjectClassifyLlmResponseSchema` was NOT defined in `@eduagent/schemas/subjects.ts` (only `subjectClassifyResultSchema` exists at line 533, which describes the service's own return shape, not the LLM response). The output is still validated by ad-hoc `Array.isArray` + `typeof` checks rather than a Zod schema.
- **Confidence:** HIGH
- **Notion sync action:** Investigate further — the greedy-regex risk is closed but the schema half remains. Consider downgrading to P3 cleanup or splitting into a follow-up.

---

### #518 — [CR-2026-05-21-113] dev-only seed-pending-redirect path not validated
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/dev-only/seed-pending-redirect.tsx:55-57`
- **Evidence:** Line 56 still passes raw `path ?? '/(app)/home'` straight to `seedPendingAuthRedirectForTesting` with no allowlist check. The CR-2026-05-19-H25 fix at lines 46-53 added a signed-in guard (good) but did not add the allowlist the finding asks for. `toInternalAppRedirectPath` may still sanitize, but the bug specifically requires an explicit Maestro-flow allowlist.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

### #571 — [CR-2026-05-21-166] pendingNotices.type uses text+CHECK instead of pgEnum
- **Verdict:** STILL_OPEN
- **File(s):** `packages/database/src/schema/profiles.ts:174, 186-189`
- **Evidence:** Column is still `type: text('type').notNull()` (line 174) with a `check('pending_notices_type_check', sql\`${table.type} in ('consent_deleted', 'consent_archived')\`)` constraint (lines 186-189). No `pgEnum('pending_notice_type', [...])` exists for this column.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

### #595 — [LEARN-14] Relearn CTA no-ops when recall deep link lacks subjectId
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/topic/recall-test.tsx:40-44, 131-137, 210-217`
- **Evidence:** `useLocalSearchParams` still reads both `topicId` and `subjectId` (lines 40-44) but only `topicId` is treated as required (line 195 fallback). `handleRelearnTopic` still returns early on `!subjectId` (line 132) with no user feedback, and `RemediationCard` is still rendered unconditionally with `onRelearnTopic={handleRelearnTopic}` (lines 210-217). No subjectId resolution path, no disabled-state UI, no toast/alert.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

### #611 — [HOMEWORK-06] Homework image attachment can silently fall back to text-only
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/session/index.tsx:824-849`, `apps/mobile/src/app/(app)/session/_hooks/use-image-base64.ts:48-86`
- **Evidence:** Auto-send useEffect (index.tsx:824-841) only short-circuits while `imageAttachmentStatus === 'loading'`; once status becomes `'timeout'` or `'failed'`, the code falls through to `void handleSend(initialProblemText, { ..., attachImage: imageAttachmentStatus === 'ready' })`, which evaluates to `attachImage: false`. The learner gets no warning. `use-image-base64.ts:48-53, 79-86` does set `'timeout'`/`'failed'` status correctly — the missing piece is a guard in the auto-send branch that surfaces recovery.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

## Summary

| BugId | CR / Tag | Verdict | Confidence |
|---|---|---|---|
| #86 | DEP-DRIFT-1 #8 | ALREADY_FIXED | HIGH |
| #387 | CR-2026-05-19-M3 | STILL_OPEN | HIGH |
| #416 | CR-2026-05-21-011 | STILL_OPEN | HIGH |
| #481 | CR-2026-05-21-076 | PARTIALLY_FIXED | HIGH |
| #518 | CR-2026-05-21-113 | STILL_OPEN | HIGH |
| #571 | CR-2026-05-21-166 | STILL_OPEN | HIGH |
| #595 | LEARN-14 | STILL_OPEN | HIGH |
| #611 | HOMEWORK-06 | STILL_OPEN | HIGH |

- 1 fully resolved (#86)
- 1 partially fixed (#481 — greedy-regex closed, schema half open)
- 6 still open
- 0 stale / NEEDS_REVIEW

PR #377 did not touch any of the files in this batch (`6c5526a76` is its merge commit; none of the implicated files appear in their history for that PR).
