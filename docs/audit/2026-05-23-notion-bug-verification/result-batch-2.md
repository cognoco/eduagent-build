### #64 — [QUIZ-01/QUIZ-07/QA-11] Practice quiz flow fails before play/results
- **Verdict:** NEEDS_REVIEW
- **File(s):** N/A (infrastructure/networking issue, not code)
- **Evidence:** Notion resolution explicitly re-classifies this as an infra/networking bug (Cloudflare HTTP/1.1 fallback on api-stg.mentomate.com) rather than a server-code defect. The page body confirms `apps/api/src/services/quiz/generate-round.ts:490-513` does no LLM calls for Capitals. Cannot be verified from code — needs ops/Cloudflare investigation.
- **Confidence:** HIGH (on classification: this is not a code bug to verify on branch)
- **Notion sync action:** Leave Open (re-route as infra ticket)

### #264 — E2E flow rewrite — Library v3 inline-expand → push (book-detail + library-navigation)
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/e2e/flows/learning/book-detail.yaml:21-23, 53-63; apps/mobile/e2e/flows/learning/library-navigation.yaml:31-32, 67-69
- **Evidence:** Both flows still contain `# DEMOTED 2026-05-19` comments and still reference `book-row-${BOOK_ID}` (book-detail.yaml:55,63; library-navigation.yaml:69). Neither has been rewritten to use `book-card-${BOOK_ID}` nor re-tagged `pr-blocking`. session-transcript*.yaml carries the same outdated testIDs as well.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #393 — [CR-2026-05-19-M9] Missing FK indexes on 4 tables
- **Verdict:** PARTIALLY_FIXED
- **File(s):** packages/database/src/schema/subjects.ts:234-235, 309-311 (fixed); packages/database/src/schema/sessions.ts:121 (fixed); packages/database/src/schema/profiles.ts:209-219 (parent index still missing)
- **Evidence:** Fixed sites: `topic_connections_topic_a_id_idx` / `_b_id_idx` (subjects.ts:234-235), `curriculum_adaptations_profile_id_idx` / `_subject_id_idx` / `_topic_id_idx` (subjects.ts:309-311), `onboarding_drafts_profile_id_idx` (sessions.ts:121, comment cites `[BUG-393]`). Still missing: `family_links_parent_profile_id_idx` — `profiles.ts:210` only has `family_links_child_profile_id_idx`; `parentProfileId` lives only in the `family_links_parent_child_unique` composite, which does not optimize parent-prefix lookups. Sweep landed in `22545aae0` ("BUG-352/357/363/365/375/393 batch") but missed the family_links parent index. `onboarding_drafts_subject_id_idx` was intentionally deferred per code comment (admin-only cascade).
- **Confidence:** HIGH
- **Notion sync action:** Leave Open (note remaining `family_links_parent_profile_id_idx` site)

### #422 — [CR-2026-05-21-017] checkEvaluateEligibility info-disclosure oracle
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/evaluate-data.ts:55-69
- **Evidence:** Topic-title lookup now joins through `curriculumTopics → curriculumBooks → subjects` with `eq(subjects.profileId, profileId)` in the WHERE clause and falls back to `topicId` if no row matches. Comment cites `[BUG-354]` — the dupe Notion entry for this exact finding. Resolving commit is `c25e17648` "fix(apps/api): requireAccount() sweep + IDOR ownership guards on retention/evaluate/recall [CR-657 / BUG-354 / BUG-391]", merged via PR #377 (`6c5526a76`).
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in c25e17648 / PR #377)

### #493 — [CR-2026-05-21-088] JWT iat skew bound not enforced
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/middleware/jwt.ts:265-276
- **Evidence:** `verifyJWT` validates only `exp` and `nbf` with strict integer-second comparisons (`< now` / `> now`) and never inspects `iat`. No leeway, no max-age constant, no `iat` check exists in the file (grep for `iat|leeway|skew|maxAge` returns only the type declaration at line 21). The described "backdated token accepted indefinitely" path is unchanged.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #520 — [CR-2026-05-21-115] create-subject useEffect cleanup race
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/create-subject.tsx:207-224
- **Evidence:** The effect still mutates the single `resolveTimeoutRef.current` and reads it back in cleanup without capturing the handle in a local closure variable. There is no "clear-before-assign" inside the `'resolving'` branch and the cleanup `clearTimeout(resolveTimeoutRef.current)` will clear whichever handle the ref currently holds — a newer effect-run can stomp the old handle. The Notion-prescribed pattern (capture handle locally; clear only matching handle) is not present.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #573 — [CR-2026-05-21-168] memoryFacts.findCascadeAncestry raw CTE snake_case columns
- **Verdict:** STILL_OPEN
- **File(s):** packages/database/src/repository.ts:451-464
- **Evidence:** Recursive arm still uses literal `m.superseded_by = a.id` and `m.profile_id = ${profileId}` strings (lines 459-460) rather than `${memoryFacts.supersededBy}` / `${memoryFacts.profileId}`. Returned rows from `db.execute(sql\`...\`)` are not validated against any row schema. No fix has landed.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #600 — [HOME-08/LEARN-08] Family fallbacks open top-level Study Library
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(app)/home.tsx:158; apps/mobile/src/app/(app)/progress/index.tsx:852-854
- **Evidence:** Home timeout recovery still calls `router.replace('/(app)/library' as Href)` (home.tsx:158) and exposes a `timeout-library-button` that routes any user — Family-mentor or otherwise — to top-level Study Library. Progress empty/stale fallback `handleEmptyProgressAction` does `if (isParentProxyView) { router.push('/(app)/library' as Href); return; }` at progress/index.tsx:852-854, which is precisely the Family-context → adult-Study leak described. No Family-aware bridge has been added.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #613 — [ACCOUNT-01] First profile setup does not capture Study/Family intent
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/create-profile.tsx:300-360
- **Evidence:** The screen collects display name (line 348) and birthdate fields only. Grep for `Study|Family.*intent|profileIntent|family_intent|account_mode|accountMode` returns zero matches in `create-profile.tsx`. No intent capture UI has been added; the gap the bug describes is unchanged.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

## Summary

| BugId | CR | Verdict | Confidence |
|---|---|---|---|
| #64 | QUIZ-01/07/QA-11 | NEEDS_REVIEW (infra, not code) | HIGH |
| #264 | M1-B E2E rewrite | STILL_OPEN | HIGH |
| #393 | CR-2026-05-19-M9 | PARTIALLY_FIXED (3 of 4 tables done; family_links parent still missing) | HIGH |
| #422 | CR-2026-05-21-017 | ALREADY_FIXED (c25e17648 / PR #377) | HIGH |
| #493 | CR-2026-05-21-088 | STILL_OPEN | HIGH |
| #520 | CR-2026-05-21-115 | STILL_OPEN | HIGH |
| #573 | CR-2026-05-21-168 | STILL_OPEN | HIGH |
| #600 | HOME-08/LEARN-08 | STILL_OPEN | HIGH |
| #613 | ACCOUNT-01 | STILL_OPEN | HIGH |

**Notes:**
- Only #422 (CR-2026-05-21-017) was silently fixed — by PR #377's BUG-354 commit (`c25e17648`). The Notion entry duplicates BUG-354 and should be moved to Resolved.
- #393 is the only partial: the BUG-352/357/363/365/375/393 batch (`22545aae0`) added 3 of the 4 missing indexes but did not add `family_links_parent_profile_id_idx`. Leave Open with a scoped note.
- #64 is environmental (Cloudflare/ALPN) and cannot be verified from branch code; treat as ops follow-up rather than code-bug.
