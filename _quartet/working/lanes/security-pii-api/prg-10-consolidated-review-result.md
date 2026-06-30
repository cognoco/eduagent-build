# PRG-10 — Consolidated Claude Review (retroactive gap-closure) — RESULT

**Reviewer:** Claude (Opus orchestrator + 7 Sonnet per-PR sub-agents), READ-ONLY, adversarial.
**Date:** 2026-06-14. **Scope:** 17 WIs / 7 merged PRs on `main`. **Method:** per-PR diff
review (`gh pr diff` / `git show`), grounded in `AGENTS.md` (Non-Negotiable Engineering Rules,
Fix Development Rules, Code Quality Guards, UX Resilience, PR/CI Protocol). Two MUST_FIX items
were re-verified directly against source by the orchestrator.

---

## Overall verdict

**PRG-10 is substantially safe-as-merged, but NOT fully clean.** Every one of the 7 PRs
genuinely closes its stated finding(s) — the security fixes are real, correctly implemented at
the core, and carry negative-path tests where AGENTS.md requires them. No **BLOCKER** was found:
there is no live, unauthenticated, high-impact exploit sitting on `main`.

However the retroactive Claude gate surfaced **2 MUST_FIX** residuals the Cosmo/CodeRabbit passes
did not catch — one a genuine **billing-code AGENTS.md violation** (unmetered LLM + silent
recovery), one an **unbounded server-side input** that the sibling client-side fix left exposed —
plus a cluster of SHOULD_FIX hardening/correctness gaps. These warrant fast-follow work items but
do **not** retroactively invalidate the merges.

**Severity tally:** BLOCKER 0 · MUST_FIX 2 · SHOULD_FIX 8 · CONSIDER 9.

| PR | WIs | Findings close? | Residual |
|---|---|---|---|
| #1121 GHA hardening | 698/709/710 | ✅ all 6 findings hold | 2 SHOULD_FIX, 2 CONSIDER |
| #1122 DoS/race | 699/711/712 | ✅ all 4 findings hold | 3 SHOULD_FIX, 2 CONSIDER |
| #1111 input validation | 700/707/708 | ⚠️ F-158 partial (server side) | **1 MUST_FIX**, 2 SHOULD_FIX, 1 CONSIDER |
| #1115 quota/billing | 701/713/714 | ⚠️ F-128 partial (bypass path) | **1 MUST_FIX**, 1 SHOULD_FIX, 1 CONSIDER |
| #1114 logging/config | 702/715/716 | ✅ functionally (F-077 dead) | 1 SHOULD_FIX, 3 CONSIDER |
| #1108 prompt-injection fence | 703 | ✅ fence holds | 2 CONSIDER |
| #1109 ThemedMarkdown | 704 | ✅ hardening holds | 2 SHOULD_FIX, 2 CONSIDER |

---

## MUST_FIX

### M1 — Homework-summary LLM runs **unmetered** on the profile-missing path + silent-recovery ban violation
- **Severity:** MUST_FIX
- **File:** `apps/api/src/inngest/functions/session-completed.ts:1796`
- **Trace:** PR #1115 / WI-701 / F-128.
- **Issue (verified in source):** the F-128 fix routes the homework-summary LLM call through
  `decrementQuota`, **except** when the profile row is absent. That branch logs a single
  `logger.warn(... event: 'metering.homework_summary.profile_missing' ...)` and then **still calls
  `extractAndStoreHomeworkSummary(...)`** — the LLM path — with no quota gate.
- **Why it matters / exploitability:** (a) **Unmetered LLM** — a soft-delete, a profile-deletion
  race against a queued session event, or replication lag on the Inngest step's DB connection
  drives this path, yielding free unbounded LLM spend on the shared pool. This is exactly the hole
  F-128 was filed to close. (b) **AGENTS.md violation** — *"Silent recovery without escalation is
  banned in billing, auth, and webhook code. Emit a structured metric or Inngest event;
  `console.warn` alone is not enough."* This is billing code recovering silently with only a warn.
- **Recommended fix:** hard-stop on missing profile — do **not** call the LLM (the row is required
  to resolve subscription, language, and accountId). Escalate via `captureException` and/or a
  `safeSend` structured event. If "best-effort LLM at any cost" is a deliberate product choice,
  document it and still wire the structured escalation.

### M2 — Server-side homework `problems` array is uncapped (F-158 fixed only on the mobile side)
- **Severity:** MUST_FIX
- **File:** `packages/schemas/src/sessions.ts:121` (`homeworkSessionMetadataSchema.problems`),
  consumed by `POST /v1/sessions/:sessionId/homework-state` (`apps/api/src/routes/sessions.ts:1364`
  → `syncHomeworkState` in `session-homework.ts:94`).
- **Trace:** PR #1111 / WI-700 / F-158.
- **Issue (verified in source):** the PR hardened the **client-side** deep-link parse
  (`parseHomeworkProblems`) but the **server** write path validates with
  `homeworkSessionMetadataSchema`, whose `problems: z.array(homeworkProblemSchema)` has **no
  `.max()`**. Each problem's `text` allows up to 10 000 chars.
- **Why it matters / exploitability:** an authenticated caller with a valid session ID can POST
  N-thousand well-formed problems (~10 MB at 1 000 problems) that `syncHomeworkState` iterates,
  driving up to O(N) `session_events` inserts per call and a large JSONB write to
  `learningSessions.metadata`. Same untrusted payload class as F-158, on the write path the fix
  didn't cover.
- **Recommended fix:** add `.max(N)` (realistic bound ~50; UX caps far lower) to
  `homeworkSessionMetadataSchema.problems` and propagate to `homeworkStateSyncSchema`. Add a
  negative-path test asserting an oversized array is rejected at the route boundary.

---

## SHOULD_FIX

### S1 — `@claude` actor guard bypassable via the `issues: assigned` event
- **File:** `.github/workflows/claude.yml:10,34` · **Trace:** PR #1121 / WI-710 / F-119.
- The job `if:` checks `github.event.issue.author_association` (the **issue creator's** association),
  but for `type: assigned` the triggering actor is `github.event.sender`, who is **not** checked. A
  trusted user opens an issue containing `@claude`; later any triage/write user assigns it → the
  secret-backed agent runs, triggered by the assigner, not the trusted mentioner. **Fix:** drop
  `assigned` from `types` (the useful trigger is `opened`), or add an explicit `github.event.sender`
  restriction.

### S2 — Prompt-injection defense relies on an implicit, undocumented env-var contract
- **File:** `.github/workflows/claude-code-review.yml:38-55` · **Trace:** PR #1121 / WI-698 / F-129.
- Routing PR title/author/base through `PR_TITLE`/`PR_AUTHOR`/`PR_BASE` job-env vars is the
  **correct** defense (keeps attacker text out of the prompt token stream). But the prompt's passive
  "available as the environment variables $PR_TITLE…" only works because Claude can shell-read them,
  and `CLAUDE_REVIEW_ARGS` does not restrict `Bash(echo:*)`/`Bash(printenv:*)`. **Fix:** make the
  read explicit (instruct `echo $PR_TITLE`) and document the env-var-indirection invariant so a
  later edit doesn't silently re-inline the attacker-controlled fields.

### S3 — JWKS module-doc comment contradicts the code (says cooldown arms on "success OR failure")
- **File:** `apps/api/src/middleware/jwt.ts:108-109` · **Trace:** PR #1122 / WI-711 / F-181.
- The cooldown is correctly armed **on success only** (line 194, after a successful re-fetch; 5xx /
  timeout / malformed-200 all throw before it — verified by the infra-failure non-arm test). But the
  module-level comment says "success OR failure." **Risk:** a maintainer trusting the comment could
  make a failed re-fetch arm the negative cache, masking an infra outage as invalid-token 401s.
  **Fix:** correct the comment to "success only."

### S4 — Dictation upsert `set:` now overwrites `mode` on completion-key conflict
- **File:** `packages/database/src/repository.ts` (`onConflictDoUpdate` set block) · **Trace:** PR #1122 / WI-712 / F-120.
- New conflict target `(profileId, completionKey)` is correct, but the `set:` block now includes
  `mode` (and `date`). A client-side `completionKey` reuse across a mode switch would silently
  clobber the original row's mode — the pre-fix `set:` preserved it. Astronomically unlikely under
  `gen_random_uuid()`, but a real silent-corruption path on a client key-reuse bug. **Fix:** drop
  `mode` (and ideally `date`) from the `set:` block — a genuine retry carries the same values.

### S5 — Interests CAS ownership check sits outside the retry loop (TOCTOU, defense-in-depth)
- **File:** `apps/api/src/services/onboarding/index.ts:205-218` · **Trace:** PR #1122 / WI-712 / F-164.
- The version-gated `UPDATE … WHERE version = expected` CAS is correct, but the `accountId`
  ownership check is a single read **before** the loop; the `UPDATE` itself has no `accountId`
  guard. No live trigger today (profiles aren't account-transferable), but the authz check and the
  write aren't atomic. **Fix:** add `accountId` to the `UPDATE` WHERE (mirror
  `updateConversationLanguage`/`updatePronouns`). Closes the co-located CONSIDER on the retry re-read.

### S6 — Dictation `chunks` arrays cap count but not per-string length
- **File:** `packages/schemas/src/dictation.ts:31-33` · **Trace:** PR #1111 / WI-708 / F-180.
- `.max(100)` bounds element **count**; each string is unbounded → ~20 MB payload across both chunk
  fields passes the `dictationReviewPromptCharCount` budget check (which only counts
  `text`+`withPunctuation`). Chunks don't reach the LLM, so no token amplification — but wire/parse
  inflation is real. **Fix:** `z.array(z.string().max(500)).max(100)` (match
  `DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS`).

### S7 — Shared-pool `resetsAt` defaults to "now" in the quota-exhausted event
- **File:** `apps/api/src/inngest/functions/session-completed.ts:1832` · **Trace:** PR #1115 / WI-701 / F-128.
- `decrementPoolQuota` never sets `resetsAt` for shared-pool (`source: 'none'`/`'daily_exceeded'`),
  so the `new Date().toISOString()` fallback tells `notify-parent-child-cap-hit` the cap resets
  immediately; the downstream handler persists that. Per-profile tiers are correct; shared-pool
  parents get a "resets right now" notification. **Fix:** derive `resetsAt` from the subscription's
  `cycleResetAt` when the decrement result lacks it.

### S8 — F-077 structured-logger conversion is a permanently dead call
- **File:** `apps/api/src/services/xp.ts:163` (+ `services/logger.ts:33`) · **Trace:** PR #1114 / WI-702 / F-077.
- `createLogger()` defaults to `minLevel='info'` and `LOG_LEVEL` is `info`/`warn` in every deployed
  env, with the binding only wired into the request-logger middleware — so the new `logger.debug(...)`
  never emits anywhere. Behaviourally identical to the old `console.debug`; the finding's intent
  (an observable-when-debugging signal) is unmet. Not a security regression. **Fix:** plumb
  `LOG_LEVEL` into the service logger (`createLogger({ level: env.LOG_LEVEL })`), or accept and
  annotate that the call is intentionally dark.

### S9 — `ThemedMarkdown`: `mailto:` silently blocked, untested; stale PR description on image policy
- **File:** `apps/mobile/src/components/common/ThemedMarkdown.tsx:40,62` · **Trace:** PR #1109 / WI-704 / F-027.
- (a) `SAFE_LINK_SCHEMES=['https:','http:']` blocks `mailto:` (correct for LLM-authored markdown)
  but there's **no test** asserting the intent, and the app uses `mailto:` elsewhere via static
  `Linking.openURL` — the policy is an undocumented side-effect. (b) The PR body describes
  `ALLOWED_IMAGE_HANDLERS=['https://']` while the merged code is `[]` (strictly stronger — all images
  disabled); the stale description misleads future reviewers, and removing the explicit prop would
  silently revert to the library's permissive default. **Fix:** add explicit `mailto:` and
  `mentomate://` block tests with a policy comment; annotate `ALLOWED_IMAGE_HANDLERS=[]` naming the
  library default that would reactivate on prop removal.

---

## CONSIDER

- **C1** `.github/workflows/e2e-ci.yml:67-70` (PR #1121, adjacent F-154): `workflow_run…base.ref`
  interpolated into `git fetch` — quoted, low blast radius (no secrets in `check-changes`), but apply
  the same env-var-routing pattern the PR established for consistency.
- **C2** `scripts/check-github-workflow-security.ts:248-280` (PR #1121 / F-132): `COMMENT_FETCH`
  regex only matches `gh api …/comments` and `gh pr view --json … comments`; a future `curl`/
  `github-script` comment-fetch would evade the verdict-gate checker. Document the scope limit.
- **C3** `apps/api/src/services/onboarding/index.ts:227` (PR #1122 / F-164): retry re-read lacks
  `accountId` — same TOCTOU as S5; fixed by S5.
- **C4** `apps/api/src/services/language-curriculum.ts` regenerate transaction (PR #1122 / F-167):
  READ COMMITTED means a concurrent double-tap loser gets a unique-constraint error (no data loss,
  acknowledged in the test) — surfaces as a user-visible error, not a security gap.
- **C5** `packages/schemas/src/quiz-utils.ts` / `guessWhoQuestionSchema.canonicalName` (PR #1111 /
  F-179): Levenshtein bound caps the attacker-controlled `answerGiven` (good); `canonicalName`/
  `acceptedAliases` (LLM-written, not user-controlled) stay unbounded — defense-in-depth only.
- **C6** `apps/api/src/routes/sessions.ts` (PR #1111 / F-166): 7 sibling handlers still use
  `c.req.param('sessionId')` after `zValidator` (not exploitable — validated identically); mechanical
  sweep to `c.req.valid('param')` is the natural follow-on to the subjects-route fix.
- **C7** `apps/api/src/inngest/functions/session-completed.ts:1815` (PR #1115 / F-128): a
  `source: 'profile_mismatch'` decrement is emitted to parents as `monthly_exceeded`, misclassifying
  a data-integrity anomaly as a quota event → spurious "child hit monthly cap" notification. Guard
  `profile_mismatch` before the `safeSend`.
- **C8** `apps/api/src/index.ts:177` (PR #1114 / F-080): CORS env read via `c as unknown as {…}`;
  a misconfigured prod deploy with no `ENVIRONMENT` binding falls through to "non-production" =
  localhost CORS open. `envValidationMiddleware` should catch it, but CORS middleware runs first.
- **C9** `apps/api/src/services/llm/sanitize.ts:49` (PR #1108 / F-139): the strip set
  `[\n\r\t"<>]` misses VT (U+000B), FF (U+000C), NEL (U+0085) — inert against Claude's tokenizer
  today but below the function's own documented "any new-line directive" contract; extend the regex.

---

## Test-coverage & guard compliance (AGENTS.md)

- **Negative-path break tests** present and correctly targeted for the CRITICAL/HIGH-class fixes:
  F-181 (DoS burst / rotation / infra-non-arm), F-120/F-164/F-167 (real-DB integration), F-142/
  F-166/F-179 (boundary rejection), F-148 (predicate-AST assertion), F-139 (red-green injection
  string), F-027 (`javascript:`/`data:`/`file:` blocked). GHA findings (F-119/F-154/F-132) are
  covered by the `check-github-workflow-security` structural checker run on every CI push — the best
  achievable for workflow-level guards; flagged honestly, **acceptable**.
- **Gaps worth a test (not blocking):** M2 (oversized problems array), S6 (chunk per-string), S9
  (`mailto:`/`mentomate://`), F-081 (query-string-secret rejection is comment-only).
- **GC1/GC6 (no new internal `jest.mock`):** no new relative-path internal mocks introduced by any
  of the 7 PRs. One annotation-quality nit: `apps/api/src/routes/assessments.test.ts:106` labels the
  internal `services/billing` mock as an `"external boundary"` — the mock is justified (billing writes
  Neon, unavailable in the unit runtime) but the wording should match the repo's `"no DB in unit
  runtime"` taxonomy.

## CI/process note (context, not a finding)
PRs #1108 and #1114 (like all 7) merged with `claude-review` **red** — the OIDC outage that is the
entire premise of this review, not a code defect. Where the verdict was observable pre-crash it was
`APPROVED`. This retroactive review **is** the gap-closure. No action beyond awareness.

---

## Proposed fast-follow Work Items (do NOT create in Cosmo — operator slices into "API Security & PII")

1. **Meter or hard-stop the homework-summary profile-missing path** — F-128 / M1 —
   `session-completed.ts:1796`: remove the unmetered LLM bypass; escalate (captureException /
   safeSend) per the billing silent-recovery ban. *(MUST_FIX — billing integrity.)*
2. **Cap server-side homework `problems` array** — F-158 / M2 — add `.max(N)` to
   `homeworkSessionMetadataSchema.problems` + sync schema + boundary test. *(MUST_FIX — DoS/resource.)*
3. **Harden the `@claude` workflow actor guard** — F-119 / S1 — drop `issues: assigned` or add a
   `github.event.sender` check in `claude.yml`. *(SHOULD_FIX — authz bypass.)*
4. **JWKS comment + cooldown doc correctness** — F-181 / S3 — fix the "success OR failure" module
   comment in `jwt.ts`. *(SHOULD_FIX — latent maintainer trap.)*
5. **Dictation upsert `set:` clobber + chunk per-string cap** — F-120/F-180 / S4+S6 — drop `mode`/
   `date` from the conflict `set:`; add `z.string().max(500)` to chunk arrays. *(SHOULD_FIX.)*
6. **Interests CAS account-scoping** — F-164 / S5+C3 — add `accountId` to the CAS `UPDATE` WHERE and
   retry re-read in `onboarding/index.ts`. *(SHOULD_FIX — TOCTOU defense-in-depth.)*
7. **Shared-pool `resetsAt` + `profile_mismatch` classification** — F-128 / S7+C7 — derive
   `resetsAt` from `cycleResetAt`; guard `profile_mismatch` out of the parent quota notification.
   *(SHOULD_FIX — notification data correctness.)*
8. **Wire `LOG_LEVEL` into service loggers** — F-077 / S8 — make `logger.debug` observable when
   debugging, or annotate the call as intentionally dark. *(SHOULD_FIX — observability.)*
9. **ThemedMarkdown test/doc top-up** — F-027 / S9 — add `mailto:` + `mentomate://` block tests,
   annotate `ALLOWED_IMAGE_HANDLERS=[]`, correct the PR description record. *(SHOULD_FIX.)*
10. **Hardening sweep bundle (CONSIDER)** — C1/C2/C5/C6/C8/C9: env-route `e2e-ci` base.ref; document
    `COMMENT_FETCH` scope; bound `canonicalName`/aliases; `sessions.ts` `c.req.valid('param')` sweep;
    CORS env-binding-absent fail-closed; extend `sanitizeXmlValue` strip set (VT/FF/NEL). *(One
    low-risk hygiene WI or several small ones, operator's call.)*

---

*End of report. No code edited, no Cosmo items created, no git mutations performed.*
