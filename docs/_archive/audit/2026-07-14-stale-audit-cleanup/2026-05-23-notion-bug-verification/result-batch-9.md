### #85 — Configure GitHub Environment protection rules for production
- **Verdict:** STILL_OPEN
- **File(s):** N/A — requires GitHub repo Settings → Environments → production admin action (not code).
- **Evidence:** Workflow code is wired (`deploy.yml` uses `environment: production` for both confirm-production jobs, per memory `project_prod_approval_gate.md`), but the actual GitHub repo Environment has `protection_rules: []` and `can_admins_bypass=true`. This is a Notion-tracked operations task, not a code defect. Cannot be verified from working tree.
- **Confidence:** HIGH (that no code fix exists; manual config is out-of-tree)
- **Notion sync action:** Leave Open

### #386 — [CR-2026-05-19-M2] Bare inngest.send().catch() chain in 2 filing.ts sites
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/routes/filing.ts:167-186, apps/api/src/routes/filing.ts:237-256
- **Evidence:** Both sites still use `await inngest.send({ name: 'app/filing.retry', ... }).catch((retryErr) => { captureException(retryErr, ...) })` — bare send with `.catch()` chain, not wrapped in `safeSend()`. The page-body suggestion (convert to `safeSend(() => inngest.send(...), 'filing.retry.<phase>', { profileId, sessionId, phase })`) has not been applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #414 — [CR-2026-05-21-009] executeDeletion claims idempotency via cascade FK but never verifies
- **Verdict:** PARTIALLY_FIXED
- **File(s):** apps/api/src/services/deletion.ts:214-259
- **Evidence:** `executeDeletion` was hardened in commit `07993f2bb` (TOCTOU race fix for BUG #494) and now uses an atomic conditional DELETE with `.returning({ id: accounts.id })` plus a follow-up SELECT to distinguish `'deleted' | 'cancelled' | 'already_deleted'`. However, the specific CR-009 ask — return rowCount, Sentry-log when rowCount=0 with no prior deletion event, AND add a guard test that every table with `profileId`/`accountId` has CASCADE FK — has NOT been implemented. No `cascade_fk_audit` or similar guard test exists in `apps/api/src/services/`.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open (note in resolution: TOCTOU race fixed by #494, but CASCADE FK guard test ask still outstanding)

### #476 — [CR-2026-05-21-071] Challenge Round mastery gate never invoked in production code
- **Verdict:** STILL_OPEN
- **File(s):** apps/api/src/services/challenge-round/evaluation.ts (definitions only); no production caller.
- **Evidence:** Grep of `decideMasteryAndReview|validateEvaluationEventIds|transitionChallengeState` across `apps/api` returns only the challenge-round source files and their `*.test.ts` siblings (`state.test.ts`, `note-draft.ts`, `evaluation.ts`, `evaluation.test.ts`, `state.ts`). No route handler, Inngest function, or session-exchange persistence path imports these — confirming the report's claim that the conservative server gate is dead code. The prompt instructs the LLM to emit `signals.challenge_round_evaluation` (`prompts.ts:24`), but nothing on the server reads the signal or writes `mastery_challenge_verified_at`.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #516 — [CR-2026-05-21-111] sign-in onSSOPress finally always clears oauthLoading
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(auth)/sign-in.tsx:691-739
- **Evidence:** After `activateSession` returns falsy, the handler `return`s (line 693) and falls through to `finally { if (isMountedRef.current) setOauthLoading(null); }` (lines 737-739). There is no "Cancel sign-in" retry UI that clears `pendingSessionActivationId` or `requestedRedirectRef.current` when a user re-taps a different provider after a failed activation. Reported fix not applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #564 — [CR-2026-05-21-159] RLS GUC name divergence between rls.ts and deferred topic_connections policy snippet
- **Verdict:** ALREADY_FIXED
- **File(s):** packages/database/src/schema/subjects.ts:277, packages/database/src/rls.ts:62
- **Evidence:** Commit `02506cbd5` "fix(packages/database): correct RLS policy setting name in comment" updated the deferred snippet. `subjects.ts:277` now reads `USING (profile_id = NULLIF(current_setting('app.current_profile_id', true), '')::uuid)`, aligned with `rls.ts:62`'s `SET LOCAL app.current_profile_id = '${profileId}'`. No occurrences of `app.profile_id` remain in `packages/database`.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in 02506cbd5)

### #594 — [LEARN-13] Recall test API accepts unowned topicId
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/retention-data.ts:669-698
- **Evidence:** Commit `c25e17648` ("requireAccount() sweep + IDOR ownership guards on retention/evaluate/recall [CR-657 / BUG-354 / BUG-391]") added an explicit ownership check at the top of `processRecallTest`: it loads the topic, resolves its `subjectId` through `curricula`, and calls `repo.subjects.findFirst(eq(subjects.id, subjectId))` via the scoped repository. If the topic doesn't belong to one of the active profile's subjects (or has no curriculum chain), it throws `NotFoundError('Topic')` BEFORE any `ensureRetentionCard` call. Matches the "Contrast: startRelearn" pattern cited in the report.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in c25e17648)

### #608 — [CC-18] Student list surfaces still allocate FlatList callbacks inline
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(app)/progress/saved.tsx:171-180, apps/mobile/src/app/(app)/progress/vocabulary.tsx:166-176, apps/mobile/src/app/(app)/quiz/history.tsx:177-180+, apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx:365-380
- **Evidence:** All four cited surfaces still pass inline arrow functions to `keyExtractor` and `renderItem`. Example, `saved.tsx:173-174`: `keyExtractor={(item) => item.id} renderItem={({ item }) => (<BookmarkRow ...`. None are hoisted to `useCallback` or module-level stable references, contradicting `docs/flows/mobile-app-flow-inventory.md:306`.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

| BugId | CR / Code | Verdict | Confidence |
|-------|-----------|---------|------------|
| #85   | (manual ops task) | STILL_OPEN | HIGH |
| #386  | CR-2026-05-19-M2 | STILL_OPEN | HIGH |
| #414  | CR-2026-05-21-009 | PARTIALLY_FIXED | HIGH |
| #476  | CR-2026-05-21-071 | STILL_OPEN | HIGH |
| #516  | CR-2026-05-21-111 | STILL_OPEN | HIGH |
| #564  | CR-2026-05-21-159 | ALREADY_FIXED | HIGH |
| #594  | LEARN-13 | ALREADY_FIXED | HIGH |
| #608  | CC-18 | STILL_OPEN | HIGH |
